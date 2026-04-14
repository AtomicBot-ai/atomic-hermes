import { contextBridge, ipcRenderer } from "electron";

type DashboardState =
  | { kind: "starting" }
  | { kind: "ready"; port: number; url: string }
  | { kind: "failed"; error: string };

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
});
