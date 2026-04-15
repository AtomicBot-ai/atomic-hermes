import { contextBridge, ipcRenderer } from "electron";

type DashboardState =
  | { kind: "starting" }
  | { kind: "ready"; port: number; url: string }
  | { kind: "failed"; error: string };

function onIpc<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld("hermesAPI", {
  getPort: (): Promise<number> => ipcRenderer.invoke("get-port"),
  getHermesHome: (): Promise<string> => ipcRenderer.invoke("get-hermes-home"),
  getDashboardState: (): Promise<DashboardState> =>
    ipcRenderer.invoke("get-dashboard-state"),
  openExternal: (url: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("open-external", { url }),
  onPythonError: (cb: (error: string) => void) => {
    ipcRenderer.on("python-error", (_event, error: string) => cb(error));
  },
  onPythonReady: (cb: () => void) => {
    ipcRenderer.on("python-ready", () => cb());
  },
  onPythonRestarting: (cb: () => void) => {
    ipcRenderer.on("python-restarting", () => cb());
  },
  onDashboardError: (cb: (error: string) => void) => {
    ipcRenderer.on("dashboard-error", (_event, error: string) => cb(error));
  },
  onDashboardReady: (cb: (state: Extract<DashboardState, { kind: "ready" }>) => void) => {
    ipcRenderer.on(
      "dashboard-ready",
      (
        _event,
        state: Extract<DashboardState, { kind: "ready" }>,
      ) => cb(state),
    );
  },
  getOnboardingState: (): Promise<{ onboarded: boolean }> =>
    ipcRenderer.invoke("onboarding-get-state"),
  setOnboardingState: (onboarded: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("onboarding-set-state", { onboarded }),
  resetAndClose: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("reset-and-close"),
  showNotification: (title: string, body: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("show-notification", { title, body }),

  // ── Analytics ──────────────────────────────────────────────────────
  analyticsGet: async (): Promise<{ enabled: boolean; userId: string; prompted: boolean }> =>
    ipcRenderer.invoke("analytics-get"),
  analyticsSet: async (enabled: boolean): Promise<{ ok: true }> =>
    ipcRenderer.invoke("analytics-set", { enabled }),

  // ── Updater ─────────────────────────────────────────────────────────
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),
  fetchReleaseNotes: (version: string, owner: string, repo: string): Promise<{ ok: boolean; body: string; htmlUrl: string }> =>
    ipcRenderer.invoke("fetch-release-notes", { version, owner, repo }),
  checkForUpdate: async (): Promise<void> => { await ipcRenderer.invoke("updater-check"); },
  downloadUpdate: async (): Promise<void> => { await ipcRenderer.invoke("updater-download"); },
  installUpdate: async (): Promise<void> => { await ipcRenderer.invoke("updater-install"); },
  onUpdateAvailable: (cb: (payload: { version: string; releaseDate?: string }) => void): (() => void) =>
    onIpc("updater-available", cb),
  onUpdateDownloadProgress: (cb: (payload: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void): (() => void) =>
    onIpc("updater-download-progress", cb),
  onUpdateDownloaded: (cb: (payload: { version: string }) => void): (() => void) =>
    onIpc("updater-downloaded", cb),
  onUpdateError: (cb: (payload: { message: string }) => void): (() => void) =>
    onIpc("updater-error", cb),

  // ── Terminal (PTY) ──────────────────────────────────────────────────
  terminalCreate: async (): Promise<{ id: string }> =>
    ipcRenderer.invoke("terminal:create"),
  terminalWrite: async (id: string, data: string): Promise<void> =>
    ipcRenderer.invoke("terminal:write", { id, data }),
  terminalResize: async (id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke("terminal:resize", { id, cols, rows }),
  terminalKill: async (id: string): Promise<void> =>
    ipcRenderer.invoke("terminal:kill", { id }),
  terminalList: async (): Promise<Array<{ id: string; alive: boolean }>> =>
    ipcRenderer.invoke("terminal:list"),
  terminalGetBuffer: async (id: string): Promise<string> =>
    ipcRenderer.invoke("terminal:get-buffer", { id }),
  onTerminalData: (cb: (payload: { id: string; data: string }) => void): (() => void) =>
    onIpc("terminal:data", cb),
  onTerminalExit: (cb: (payload: { id: string; exitCode: number; signal?: number }) => void): (() => void) =>
    onIpc("terminal:exit", cb),

  // ── Files ─────────────────────────────────────────────────────────
  filesListDir: async (p: string): Promise<Array<{ name: string; type: "file" | "dir"; size: number; mtime: number }>> =>
    ipcRenderer.invoke("files:list-dir", { path: p }),
  filesReadFile: async (p: string): Promise<{ content: string; size: number }> =>
    ipcRenderer.invoke("files:read-file", { path: p }),
  filesWriteFile: async (p: string, content: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("files:write-file", { path: p, content }),
  filesCreateDir: async (p: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("files:create-dir", { path: p }),
  filesRename: async (oldPath: string, newPath: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("files:rename", { oldPath, newPath }),
  filesDelete: async (p: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("files:delete", { path: p }),

  // ── File Snapshots (Local History) ────────────────────────────
  filesListSnapshots: async (p: string): Promise<Array<{ snapshotPath: string; timestamp: number; size: number; label: string }>> =>
    ipcRenderer.invoke("files:list-snapshots", { path: p }),
  filesReadSnapshot: async (snapshotPath: string): Promise<{ content: string; size: number }> =>
    ipcRenderer.invoke("files:read-snapshot", { snapshotPath }),
  filesDeleteSnapshot: async (snapshotPath: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("files:delete-snapshot", { snapshotPath }),
  filesRestoreSnapshot: async (p: string, snapshotPath: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("files:restore-snapshot", { path: p, snapshotPath }),

  // ── Sidebar (Favorites, Memories, Skills) ─────────────────────
  sidebarListProfiles: async (): Promise<{ profiles: string[]; selected: string }> =>
    ipcRenderer.invoke("sidebar:list-profiles"),
  sidebarSelectProfile: async (profileName: string): Promise<{ ok: boolean; selected: string }> =>
    ipcRenderer.invoke("sidebar:select-profile", { profileName }),
  sidebarGetProfileHome: async (): Promise<{ profileHome: string; profileName: string }> =>
    ipcRenderer.invoke("sidebar:get-profile-home"),
  sidebarListMemories: async (): Promise<Array<{ name: string; exists: boolean }>> =>
    ipcRenderer.invoke("sidebar:list-memories"),
  sidebarReadMemoryFile: async (filename: string): Promise<{ content: string; size: number; relativePath: string }> =>
    ipcRenderer.invoke("sidebar:read-memory-file", { filename }),
  sidebarWriteMemoryFile: async (filename: string, content: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("sidebar:write-memory-file", { filename, content }),
  sidebarListSkills: async (): Promise<Array<{ name: string; description: string; dirPath: string }>> =>
    ipcRenderer.invoke("sidebar:list-skills"),
  sidebarReadSkillFile: async (skillDir: string): Promise<{ content: string; size: number; relativePath: string }> =>
    ipcRenderer.invoke("sidebar:read-skill-file", { skillDir }),
  sidebarGetFavorites: async (): Promise<Array<{ path: string; type: "file" | "dir"; name: string }>> =>
    ipcRenderer.invoke("sidebar:get-favorites"),
  sidebarSetFavorites: async (entries: Array<{ path: string; type: "file" | "dir"; name: string }>): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("sidebar:set-favorites", { entries }),
});
