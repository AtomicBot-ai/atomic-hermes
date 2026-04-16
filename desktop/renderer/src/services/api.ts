import { withHermesHeaders, withHermesHeadersForProfile } from "./request-context";

export function getBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export type CapabilitiesResponse = {
  version: string;
  platform: string;
  capabilities: Record<string, boolean>;
};

export type ConfigResponse = {
  config: Record<string, unknown>;
  activeModel: string;
  activeProvider: string;
  hermesHome: string;
  hasApiKeys: boolean;
  providers: Array<{
    envVar: string;
    configured: boolean;
    maskedKey: string;
  }>;
};

export type ProviderInfo = {
  name: string;
  id: string;
  authenticated: boolean;
  baseUrl?: string;
};

export type ProvidersResponse = {
  providers: ProviderInfo[];
  currentProvider: string;
  currentModel: string;
};

export type ConfigPatchBody = {
  config?: Record<string, unknown>;
  env?: Record<string, string>;
};

export type ModelEntry = { id: string; object?: string };

export type DeviceCodeResponse = {
  ok: boolean;
  provider?: string;
  device_code?: string;
  user_code?: string;
  verification_uri_complete?: string;
  interval?: number;
  expires_in?: number;
  client_id?: string;
  portal_base_url?: string;
  error?: string;
};

export type PollTokenResponse = {
  status: "pending" | "success" | "error";
  message?: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, withHermesHeaders(init));
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function checkCapabilities(
  port: number,
): Promise<CapabilitiesResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/capabilities`);
}

export async function checkHealth(port: number): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl(port)}/health`, withHermesHeaders({
      signal: AbortSignal.timeout(5000),
    }));
    return res.ok;
  } catch {
    return false;
  }
}

export async function getConfig(
  port: number,
  profileIdOverride?: string | null,
): Promise<ConfigResponse> {
  const init = profileIdOverride?.trim()
    ? withHermesHeadersForProfile(profileIdOverride.trim())
    : withHermesHeaders();
  return fetchJson(`${getBaseUrl(port)}/api/config`, init);
}

export async function patchConfig(
  port: number,
  body: ConfigPatchBody,
  profileIdOverride?: string | null,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const base: RequestInit = {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  const init = profileIdOverride?.trim()
    ? withHermesHeadersForProfile(profileIdOverride.trim(), base)
    : withHermesHeaders(base);
  return fetchJson(`${getBaseUrl(port)}/api/config`, init);
}

export async function getProviders(port: number): Promise<ProvidersResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/providers`);
}

export async function fetchModels(port: number): Promise<ModelEntry[]> {
  try {
    const data = await fetchJson<{ data?: ModelEntry[]; models?: ModelEntry[] }>(
      `${getBaseUrl(port)}/v1/models`,
    );
    return (data.data || data.models || []).filter((m) => m.id);
  } catch {
    return [];
  }
}

export type ProviderModelEntry = { id: string; description: string };

export async function fetchProviderModels(
  port: number,
  provider: string,
): Promise<ProviderModelEntry[]> {
  try {
    const data = await fetchJson<{
      ok: boolean;
      models?: ProviderModelEntry[];
    }>(`${getBaseUrl(port)}/api/provider-models?provider=${encodeURIComponent(provider)}`);
    return (data.models || []).filter((m) => m.id);
  } catch {
    return [];
  }
}

export async function testChat(
  port: number,
  model?: string,
): Promise<{ ok: boolean; reply: string }> {
  const body: Record<string, unknown> = {
    messages: [
      {
        role: "user",
        content:
          "Reply with one short sentence confirming the connection works.",
      },
    ],
    stream: false,
    max_tokens: 80,
  };
  if (model) body.model = model;

  const res = await fetch(`${getBaseUrl(port)}/v1/chat/completions`, withHermesHeaders({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  }));

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim() || "";
  return { ok: true, reply: reply || "Chat test succeeded." };
}

export type LogsResponse = {
  file: string;
  lines: string[];
};

export async function getLogs(
  port: number,
  params: {
    file?: string;
    lines?: number;
    level?: string;
    component?: string;
  },
): Promise<LogsResponse> {
  const qs = new URLSearchParams();
  if (params.file) qs.set("file", params.file);
  if (params.lines) qs.set("lines", String(params.lines));
  if (params.level && params.level !== "ALL") qs.set("level", params.level);
  if (params.component && params.component !== "all")
    qs.set("component", params.component);
  return fetchJson(`${getBaseUrl(port)}/api/logs?${qs.toString()}`);
}

export async function requestDeviceCode(
  port: number,
  provider: "nous" | "openai-codex",
): Promise<DeviceCodeResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/oauth/device-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

export async function pollOAuthToken(
  port: number,
  provider: "nous" | "openai-codex",
  deviceCode: string,
  extra?: Record<string, string>,
): Promise<PollTokenResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/oauth/poll-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, deviceCode, ...extra }),
  });
}

export type BackupCreateResponse = {
  ok: boolean;
  path?: string;
  size?: number;
  fileCount?: number;
  error?: string;
};

export async function createBackup(port: number): Promise<BackupCreateResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/backup/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export type BackupRestoreResponse = {
  ok: boolean;
  restored?: number;
  errors?: string[];
  error?: string;
};

export async function restoreBackup(
  port: number,
  base64: string,
  filename: string,
): Promise<BackupRestoreResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/backup/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, filename }),
  });
}
