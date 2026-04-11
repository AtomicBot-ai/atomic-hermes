import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hermesAPI", {
  getPort: (): Promise<number> => ipcRenderer.invoke("get-port"),
  getHermesHome: (): Promise<string> => ipcRenderer.invoke("get-hermes-home"),
  onPythonError: (cb: (error: string) => void) => {
    ipcRenderer.on("python-error", (_event, error: string) => cb(error));
  },
  onPythonReady: (cb: () => void) => {
    ipcRenderer.on("python-ready", () => cb());
  },
});
