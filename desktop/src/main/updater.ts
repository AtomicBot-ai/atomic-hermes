import { app, type BrowserWindow } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { showUpdateSplash } from "./update-splash";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 5_000;

let initialized = false;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the auto-updater. Must be called once after app is ready.
 *
 * Events are forwarded to the renderer via `webContents.send()` so the UI can
 * display notifications and progress.
 */
export function initAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (initialized) {
    return;
  }
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendToRenderer(getMainWindow(), "updater-checking", {});
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    sendToRenderer(getMainWindow(), "updater-available", {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on("update-not-available", (_info: UpdateInfo) => {
    sendToRenderer(getMainWindow(), "updater-not-available", {});
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer(getMainWindow(), "updater-download-progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    sendToRenderer(getMainWindow(), "updater-downloaded", {
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    sendToRenderer(getMainWindow(), "updater-error", {
      message: String(err?.message ?? err),
    });
  });

  setTimeout(() => {
    void checkForUpdates();
  }, INITIAL_DELAY_MS);

  periodicTimer = setInterval(() => {
    void checkForUpdates();
  }, CHECK_INTERVAL_MS);
}

export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.warn("[updater] checkForUpdates failed:", err);
  }
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate();
}

export function installUpdate(): void {
  showUpdateSplash();
  autoUpdater.quitAndInstall();
}

export function getAppVersion(): string {
  return app.getVersion();
}

function sendToRenderer(win: BrowserWindow | null, channel: string, payload: unknown): void {
  try {
    win?.webContents.send(channel, payload);
  } catch (err) {
    console.warn("[updater] sendToRenderer failed:", err);
  }
}

export function disposeAutoUpdater(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}
