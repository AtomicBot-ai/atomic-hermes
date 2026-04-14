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
});
