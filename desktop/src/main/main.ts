import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  session,
  shell,
} from "electron";
import * as fs from "fs";
import * as path from "path";
import { startPythonBackend, PythonBridge } from "./python-bridge";
import {
  readOnboardedState,
  writeOnboardedState,
  clearOnboardedState,
} from "./onboarding-state";
import { registerTerminalIpcHandlers } from "./terminal/ipc";
import { killAllTerminals } from "./terminal/pty-manager";
import { registerFilesIpcHandlers } from "./files/ipc";
import { registerSnapshotIpcHandlers } from "./files/snapshot-ipc";
import { registerSidebarIpcHandlers } from "./files/sidebar-ipc";
import { SnapshotWatcher } from "./files/snapshot-watcher";
import {
  initAutoUpdater,
  disposeAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  getAppVersion,
} from "./updater";
import { registerLlamacppIpcHandlers } from "./llamacpp/ipc";
import {
  stopLlamacppServer,
  killOrphanedServer,
  startLlamacppServer,
} from "./llamacpp/server";
import { readActiveModelId } from "./llamacpp/model-state";
import {
  getLlamacppModelDef,
  resolveLlamacppModelPath,
  resolveChatTemplatePath,
  type LlamacppModelId,
} from "./llamacpp/models";
import {
  isBackendDownloaded,
  resolveServerBinPath,
} from "./llamacpp/backend-download";
import { getSystemInfo, computeContextLength } from "./llamacpp/hardware";
import { isAnyProfileUsingLlamacpp } from "./llamacpp/profile-usage";
import { killUpdateSplash } from "./update-splash";
import {
  readAnalyticsState,
  writeAnalyticsState,
} from "./analytics/analytics-state";
import {
  initPosthogMain,
  captureMain,
  shutdownPosthogMain,
} from "./analytics/posthog-main";
import { registerAnalyticsHandlers } from "./analytics/analytics-ipc";
import {
  registerNotificationsHandlers,
  isNotificationsEnabled,
} from "./notifications";
import { handleDeepLink } from "./atomic-auth/deep-link";
import {
  startStripeThanksServer,
  type StripeThanksServer,
} from "./atomic-auth/stripe-thanks-server";

const DEEP_LINK_PROTOCOL = "atomicbot-hermes";

app.setPath(
  "userData",
  path.join(app.getPath("appData"), "ai.atomicbot.hermes"),
);

// Single-instance lock + deep-link protocol registration must happen before
// `app.whenReady()`. When a second instance is launched (e.g. by macOS opening
// an `atomicbot-hermes://...` URL while the app is already running), we forward
// the URL to the existing main window via `second-instance` / `open-url`
// events. Note: the scheme is `atomicbot-hermes://` (not `atomicbot://`) to
// avoid colliding with the openclaw desktop client which uses `atomicbot://`.
// The backend allowlist (`ALLOWED_DESKTOP_SCHEMES`) must include this exact
// value, otherwise OAuth/Stripe deep links fall back to `atomicbot://`.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]!),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
}

let mainWindow: BrowserWindow | null = null;
let pythonBridge: PythonBridge | null = null;
let backendPort: number | null = null;
let snapshotWatcher: SnapshotWatcher | null = null;
let stripeThanksServer: StripeThanksServer | null = null;

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

type DashboardState =
  | { kind: "starting" }
  | { kind: "ready"; port: number; url: string }
  | { kind: "failed"; error: string };

let dashboardState: DashboardState = { kind: "starting" };

function createWindow(): void {
  const windowTitle = `Atomic Hermes v${app.getVersion()}`;

  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: windowTitle,
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Prevent the <title> tag in index.html from overriding our versioned title.
  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
  });

  const rendererPath = path.join(
    __dirname,
    "..",
    "..",
    "renderer",
    "dist",
    "index.html",
  );

  mainWindow.loadFile(rendererPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const stateDir = path.join(app.getPath("userData"), "hermes");
const llamacppDataDir = path.join(app.getPath("userData"), "llamacpp");

// ── Analytics ────────────────────────────────────────────────────────
const analyticsState = readAnalyticsState(stateDir);
if (!analyticsState.prompted) {
  analyticsState.enabled = true;
  analyticsState.prompted = true;
  analyticsState.enabledAt =
    analyticsState.enabledAt ?? new Date().toISOString();
  writeAnalyticsState(stateDir, analyticsState);
}
initPosthogMain(analyticsState.userId, analyticsState.enabled);
captureMain("app_launched", {
  platform: process.platform,
  version: app.getVersion(),
});

registerAnalyticsHandlers({ stateDir });
registerNotificationsHandlers({ stateDir });

// Deep link delivery (atomicbot-hermes://...) — macOS uses `open-url`,
// Windows/Linux receive the URL as an argv entry on a second-instance launch.
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url, mainWindow);
  // macOS delivers deep links via `open-url` while the app is already
  // running; bring the window forward so the user lands back in Hermes
  // instead of Stripe's tab.
  focusMainWindow();
});

app.on("second-instance", (_event, argv) => {
  const url = argv.find(
    (arg) =>
      typeof arg === "string" && arg.startsWith(`${DEEP_LINK_PROTOCOL}://`),
  );
  if (url) {
    handleDeepLink(url, mainWindow);
  }
  focusMainWindow();
});

ipcMain.handle("get-port", () => backendPort);
ipcMain.handle("get-hermes-home", () => stateDir);
ipcMain.handle("get-dashboard-state", () => dashboardState);
ipcMain.handle("open-external", async (_evt, payload: { url?: string }) => {
  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (!url) {
    throw new Error("URL is required");
  }
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle("get-launch-at-login", () => {
  // Electron documents login items for macOS and Windows only.
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return { enabled: false };
  }
  const opts =
    process.platform === "win32" ? { path: app.getPath("exe") } : undefined;
  const s = app.getLoginItemSettings(opts);
  return { enabled: Boolean(s.openAtLogin) };
});

ipcMain.handle(
  "set-launch-at-login",
  (_evt, payload: { enabled?: boolean }) => {
    if (process.platform !== "darwin" && process.platform !== "win32") {
      throw new Error("Launch at login is only available on macOS and Windows");
    }
    const enabled = Boolean(payload?.enabled);
    if (process.platform === "win32") {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath("exe"),
      });
    } else {
      app.setLoginItemSettings({ openAtLogin: enabled });
    }
    return { ok: true };
  },
);

ipcMain.handle("onboarding-get-state", () => {
  return { onboarded: readOnboardedState(stateDir) };
});

ipcMain.handle(
  "onboarding-set-state",
  (_evt, payload: { onboarded?: boolean }) => {
    if (payload.onboarded) {
      writeOnboardedState(stateDir, true);
    } else {
      clearOnboardedState(stateDir);
    }
    return { ok: true };
  },
);

ipcMain.handle("reset-and-close", async () => {
  if (snapshotWatcher) {
    await snapshotWatcher.asyncStop();
    snapshotWatcher = null;
  }

  await stopLlamacppServer().catch(() => {});
  if (pythonBridge) {
    await pythonBridge.killAndWait();
    pythonBridge = null;
  }
  backendPort = null;

  killAllTerminals();

  const rmOpts = {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  } as const;
  fs.rmSync(stateDir, rmOpts);

  await session.defaultSession.clearStorageData();

  setTimeout(() => {
    app.relaunch();
    app.quit();
  }, 50);

  return { ok: true };
});

ipcMain.handle(
  "show-notification",
  (_evt, payload: { title: string; body: string }) => {
    if (!Notification.isSupported()) return { ok: false };
    if (!isNotificationsEnabled(stateDir)) return { ok: false, disabled: true };
    const notif = new Notification({
      title: payload.title,
      body: payload.body,
    });
    notif.on("click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    notif.show();
    return { ok: true };
  },
);

registerTerminalIpcHandlers({
  getMainWindow: () => mainWindow,
  stateDir,
});

registerFilesIpcHandlers({ stateDir });
registerSnapshotIpcHandlers({ stateDir });
registerSidebarIpcHandlers({ stateDir });
registerLlamacppIpcHandlers({
  llamacppDataDir,
  stateDir,
  getMainWindow: () => mainWindow,
});

snapshotWatcher = new SnapshotWatcher(stateDir);
snapshotWatcher.start();

// ── Updater IPC ──────────────────────────────────────────────────────

ipcMain.handle("get-app-version", () => getAppVersion());

ipcMain.handle("updater-check", async () => {
  await checkForUpdates();
  return { ok: true };
});

ipcMain.handle("updater-download", async () => {
  await downloadUpdate();
  return { ok: true };
});

ipcMain.handle("updater-install", () => {
  installUpdate();
  return { ok: true };
});

ipcMain.handle(
  "fetch-release-notes",
  async (_evt, p: { version?: string; owner?: string; repo?: string }) => {
    const version = typeof p?.version === "string" ? p.version : "";
    const owner = typeof p?.owner === "string" ? p.owner : "";
    const repo = typeof p?.repo === "string" ? p.repo : "";
    if (!version || !owner || !repo) {
      return { ok: false, body: "", htmlUrl: "" };
    }
    const tag = version.startsWith("v") ? version : `v${version}`;
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!res.ok) {
        return { ok: false, body: "", htmlUrl: "" };
      }
      const data = (await res.json()) as { body?: string; html_url?: string };
      return { ok: true, body: data.body ?? "", htmlUrl: data.html_url ?? "" };
    } catch (err) {
      console.warn("[ipc/updater] fetch-release-notes failed:", err);
      return { ok: false, body: "", htmlUrl: "" };
    }
  },
);

async function startDesktopBackend(): Promise<void> {
  try {
    pythonBridge = await startPythonBackend();
    backendPort = pythonBridge.port;
    mainWindow?.webContents.send("python-ready");

    pythonBridge.onRestartExit(() => {
      console.log("Gateway requested restart (exit 75), restarting backend...");
      mainWindow?.webContents.send("python-restarting");
      void startDesktopBackend();
    });

    pythonBridge.dashboardPort
      .then((port) => {
        const url = `http://127.0.0.1:${port}`;
        dashboardState = { kind: "ready", port, url };
        mainWindow?.webContents.send("dashboard-ready", dashboardState);
      })
      .catch((err) => {
        const error = err?.message || String(err);
        console.error("Dashboard did not start:", error);
        dashboardState = { kind: "failed", error };
        mainWindow?.webContents.send("dashboard-error", error);
      });
  } catch (err: any) {
    console.error("Failed to start Python backend:", err);
    mainWindow?.webContents.send("python-error", err.message || String(err));
    dashboardState = {
      kind: "failed",
      error: "Gateway process failed to start",
    };
    mainWindow?.webContents.send("dashboard-error", dashboardState.error);
  }
}

async function autoStartLlamacppIfNeeded(): Promise<void> {
  if (process.platform !== "darwin") return;

  killOrphanedServer(stateDir);

  if (!isAnyProfileUsingLlamacpp(stateDir)) {
    console.log(
      "[llamacpp] auto-start skipped: no profile is configured to use llama.cpp",
    );
    return;
  }

  const activeId = readActiveModelId(stateDir);
  if (!activeId) return;
  if (!isBackendDownloaded(llamacppDataDir)) return;

  const model = getLlamacppModelDef(activeId as LlamacppModelId);
  const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);
  const binPath = resolveServerBinPath(llamacppDataDir);

  if (!fs.existsSync(modelPath) || !fs.existsSync(binPath)) return;

  try {
    const sysInfo = getSystemInfo();
    const ctxLen = computeContextLength(sysInfo.totalRamGb, model);
    const chatTemplateFile = resolveChatTemplatePath(model, {
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
    });
    console.log(`[llamacpp] auto-starting server for model=${activeId}`);
    await startLlamacppServer(binPath, modelPath, {
      contextLength: ctxLen,
      modelId: activeId,
      chatTemplateFile,
      stateDir,
    });
  } catch (err) {
    console.warn("[llamacpp] auto-start failed:", err);
  }
}

app.whenReady().then(async () => {
  createWindow();
  killUpdateSplash();
  if (app.isPackaged) {
    initAutoUpdater(() => mainWindow);
  }
  await startDesktopBackend();
  void autoStartLlamacppIfNeeded();
  // Localhost landing page for post-Stripe-Checkout returns. Failure to bind
  // (port collision with another Hermes instance) is non-fatal: the renderer
  // still polls the balance after top-up.
  stripeThanksServer = await startStripeThanksServer();
});

app.on("window-all-closed", () => {
  void stopLlamacppServer().catch(() => {});
  pythonBridge?.kill();
  app.quit();
});

app.on("before-quit", () => {
  snapshotWatcher?.stop();
  snapshotWatcher = null;
  disposeAutoUpdater();
  killAllTerminals();
  void stopLlamacppServer().catch(() => {});
  pythonBridge?.kill();
  void stripeThanksServer?.stop().catch(() => {});
  stripeThanksServer = null;
  void shutdownPosthogMain();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
