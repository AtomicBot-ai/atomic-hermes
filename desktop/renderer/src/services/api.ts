import { withHermesHeaders } from "./request-context";

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

export async function getConfig(port: number): Promise<ConfigResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/config`);
}

export async function patchConfig(
  port: number,
  body: ConfigPatchBody,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  return fetchJson(`${getBaseUrl(port)}/api/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
