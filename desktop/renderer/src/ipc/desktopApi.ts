/**
 * Typed wrapper around the Electron preload IPC bridge (`window.hermesAPI`).
 */

export type UpdateAvailablePayload = {
  version: string;
  releaseDate?: string;
};

export type UpdateDownloadProgressPayload = {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
};

export type UpdateDownloadedPayload = {
  version: string;
};

export type UpdateErrorPayload = {
  message: string;
};

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
  analyticsGet?(): Promise<{ enabled: boolean; userId: string; prompted: boolean }>;
  analyticsSet?(enabled: boolean): Promise<{ ok: true }>;

  // Updater
  getAppVersion?(): Promise<string>;
  fetchReleaseNotes?(
    version: string,
    owner: string,
    repo: string,
  ): Promise<{ ok: boolean; body: string; htmlUrl: string }>;
  checkForUpdate?(): Promise<void>;
  downloadUpdate?(): Promise<void>;
  installUpdate?(): Promise<void>;
  onUpdateAvailable?(cb: (payload: UpdateAvailablePayload) => void): () => void;
  onUpdateDownloadProgress?(cb: (payload: UpdateDownloadProgressPayload) => void): () => void;
  onUpdateDownloaded?(cb: (payload: UpdateDownloadedPayload) => void): () => void;
  onUpdateError?(cb: (payload: UpdateErrorPayload) => void): () => void;
}

export const DESKTOP_API_UNAVAILABLE = "Desktop API not available";

export function getDesktopApi(): DesktopApi {
  const api = (window as any).hermesAPI as DesktopApi | undefined;
  if (!api) {
    throw new Error("Desktop API not available — not running inside Electron");
  }
  return api;
}

export function getDesktopApiOrNull(): DesktopApi | null {
  return ((window as any).hermesAPI as DesktopApi | undefined) ?? null;
}

export function isDesktopApiAvailable(): boolean {
  return (window as any).hermesAPI != null;
}
