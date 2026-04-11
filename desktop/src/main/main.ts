import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { startPythonBackend, PythonBridge } from "./python-bridge";

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
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
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

ipcMain.handle("get-port", () => backendPort);
ipcMain.handle("get-hermes-home", () => {
  return path.join(app.getPath("appData"), "ai.atomicbot.hermes");
});

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
