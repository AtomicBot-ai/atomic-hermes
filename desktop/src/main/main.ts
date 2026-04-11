import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "path";
import { startPythonBackend, PythonBridge } from "./python-bridge";
import {
  readOnboardedState,
  writeOnboardedState,
  clearOnboardedState,
} from "./onboarding-state";

app.setPath("userData", path.join(app.getPath("appData"), "ai.atomicbot.hermes"));

let mainWindow: BrowserWindow | null = null;
let pythonBridge: PythonBridge | null = null;
let backendPort: number | null = null;

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

app.whenReady().then(async () => {
  createWindow();

  try {
    pythonBridge = await startPythonBackend();
    backendPort = pythonBridge.port;
    mainWindow?.webContents.send("python-ready");
  } catch (err: any) {
    console.error("Failed to start Python backend:", err);
    mainWindow?.webContents.send("python-error", err.message || String(err));
  }
});

app.on("window-all-closed", () => {
  pythonBridge?.kill();
  app.quit();
});

app.on("before-quit", () => {
  pythonBridge?.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
