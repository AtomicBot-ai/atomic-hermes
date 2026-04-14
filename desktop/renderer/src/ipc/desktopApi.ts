/**
 * Typed wrapper around the Electron preload IPC bridge.
 *
 * In the current Hermes desktop build the bridge is not yet wired,
 * so getDesktopApiOrNull() always returns null and callers degrade
 * gracefully (buttons disabled, error messages shown).
 *
 * TODO: wire the real Electron preload bridge and expose it on
 * `window.hermesDesktop` via contextBridge.exposeInMainWorld.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DesktopApi {
  openExternal?(url: string): void;
  getLaunchAtLogin?(): Promise<{ enabled: boolean }>;
  setLaunchAtLogin?(enabled: boolean): Promise<void>;
  openHermesFolder?(): Promise<void>;
  openWorkspaceFolder?(): Promise<void>;
  createBackup?(mode?: string): Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
  restoreBackup?(
    base64: string,
    filename: string,
  ): Promise<{ ok: boolean; error?: string; meta?: { mode?: string } }>;
  resetAndClose?(): Promise<void>;
  analyticsGet?(): Promise<{ enabled: boolean }>;
  analyticsSet?(enabled: boolean): Promise<void>;
}

export const DESKTOP_API_UNAVAILABLE = "Desktop API not available";

export function getDesktopApi(): DesktopApi {
  const api = (window as any).hermesDesktop as DesktopApi | undefined;
  if (!api) {
    throw new Error("Desktop API not available — not running inside Electron");
  }
  return api;
}

export function getDesktopApiOrNull(): DesktopApi | null {
  return ((window as any).hermesDesktop as DesktopApi | undefined) ?? null;
}

export function isDesktopApiAvailable(): boolean {
  return (window as any).hermesDesktop != null;
}
