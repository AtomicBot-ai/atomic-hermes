/**
 * Typed wrapper around the Electron preload IPC bridge (`window.hermesAPI`).
 */

export type ModelCompatibility = "recommended" | "possible" | "not-recommended";

export type LlamacppSystemInfoResponse = {
  totalRamGb: number;
  arch: string;
  platform: string;
  isAppleSilicon: boolean;
  models: Array<{ id: string; name: string; compatibility: ModelCompatibility }>;
};

export type LlamacppBackendStatusResponse = {
  downloaded: boolean;
  version: string | null;
  downloadedAt: string | null;
};

export type LlamacppModelListEntry = {
  id: string;
  name: string;
  description: string;
  sizeLabel: string;
  contextLabel: string;
  downloaded: boolean;
  size: number;
  compatibility: ModelCompatibility;
  icon: string;
  tag?: string;
};

export type LlamacppServerStartResponse = {
  ok: boolean;
  port?: number;
  modelId?: string;
  modelName?: string;
  contextLength?: number;
  error?: string;
};

export type LlamacppServerStatusResponse = {
  running: boolean;
  modelPath: string | null;
  port: number;
  healthy: boolean;
  loading: boolean;
  activeModelId: string | null;
};

export type LlamacppDownloadProgress = {
  percent: number;
  transferred: number;
  total: number;
};

export type LlamacppModelDownloadProgress = LlamacppDownloadProgress & {
  modelId: string;
};

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
  /** Node/Electron `process.platform` when running inside Electron preload. */
  platform?: string;
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

  // Llamacpp (Local Models)
  llamacppSystemInfo?(): Promise<LlamacppSystemInfoResponse>;
  llamacppBackendStatus?(): Promise<LlamacppBackendStatusResponse>;
  llamacppBackendDownload?(): Promise<{ ok: boolean; tag?: string; error?: string }>;
  llamacppBackendDownloadCancel?(): Promise<{ ok: boolean }>;
  llamacppBackendUpdate?(): Promise<{ ok: boolean; updateAvailable?: boolean; latestTag?: string; currentTag?: string | null; error?: string }>;
  llamacppModelStatus?(model?: string): Promise<{ downloaded: boolean; modelPath: string; size: number; modelId: string }>;
  llamacppModelDownload?(model?: string): Promise<{ ok: boolean; modelPath?: string; error?: string }>;
  llamacppModelDownloadCancel?(): Promise<{ ok: boolean }>;
  llamacppModelDelete?(model: string): Promise<{ ok: boolean; error?: string }>;
  llamacppModelsList?(): Promise<LlamacppModelListEntry[]>;
  llamacppServerStart?(model?: string): Promise<LlamacppServerStartResponse>;
  llamacppServerStop?(): Promise<{ ok: boolean; error?: string }>;
  llamacppClearActiveModel?(): Promise<{ ok: boolean }>;
  llamacppServerStatus?(): Promise<LlamacppServerStatusResponse>;
  llamacppSetActiveModel?(model: string): Promise<LlamacppServerStartResponse>;
  llamacppWarmupGet?(): Promise<{ state: "idle" | "warming" | "done"; modelId: string | null }>;
  llamacppWarmupSet?(params: {
    state: "idle" | "warming" | "done";
    modelId: string | null;
  }): Promise<{ ok: boolean }>;
  onLlamacppBackendDownloadProgress?(cb: (payload: LlamacppDownloadProgress) => void): () => void;
  onLlamacppModelDownloadProgress?(cb: (payload: LlamacppModelDownloadProgress) => void): () => void;
  llamacppPropagateModel?(model: string): Promise<{ ok: boolean; updatedProfiles: string[] }>;

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

  // Profile seeding
  seedProfileProvider?(source: string, target: string): Promise<{ ok: boolean; error?: string }>;
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
