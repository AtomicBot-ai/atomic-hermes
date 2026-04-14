import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "path";
import { startPythonBackend, PythonBridge } from "./python-bridge";
import {
  readOnboardedState,
  writeOnboardedState,
  clearOnboardedState,
} from "./onboarding-state";
import { registerTerminalIpcHandlers } from "./terminal/ipc";
import { killAllTerminals } from "./terminal/pty-manager";

app.setPath("userData", path.join(app.getPath("appData"), "ai.atomicbot.hermes"));

let mainWindow: BrowserWindow | null = null;
let pythonBridge: PythonBridge | null = null;
let backendPort: number | null = null;

type DashboardState =
  | { kind: "starting" }
  | { kind: "ready"; port: number; url: string }
  | { kind: "failed"; error: string };

let dashboardState: DashboardState = { kind: "starting" };

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 480,
    minHeight: 400,
    title: "Atomic Hermes",
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererPath = app.isPackaged
    ? path.join(__dirname, "..", "renderer", "dist", "index.html")
    : path.join(__dirname, "..", "..", "renderer", "dist", "index.html");

  mainWindow.loadFile(rendererPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const stateDir = path.join(app.getPath("userData"), "hermes");

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

registerTerminalIpcHandlers({
  getMainWindow: () => mainWindow,
  stateDir,
});

async function startDesktopBackend(): Promise<void> {
  try {
    pythonBridge = await startPythonBackend();
    backendPort = pythonBridge.port;
    mainWindow?.webContents.send("python-ready");

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
    dashboardState = { kind: "failed", error: "Gateway process failed to start" };
    mainWindow?.webContents.send("dashboard-error", dashboardState.error);
  }
}

app.whenReady().then(async () => {
  createWindow();
  await startDesktopBackend();
});

app.on("window-all-closed", () => {
  pythonBridge?.kill();
  app.quit();
});

app.on("before-quit", () => {
  killAllTerminals();
  pythonBridge?.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
