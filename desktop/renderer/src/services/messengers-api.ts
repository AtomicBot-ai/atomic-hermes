import { withHermesHeaders } from "./request-context";

export type PlatformStatus = {
  id: string;
  name: string;
  description: string;
  depsInstalled: boolean;
  configured: boolean;
  running: boolean;
  pipExtra: string | null;
  requiredEnv: string[];
  optionalEnv: string[];
  externalDep?: string;
};

export type MessengersResponse = {
  platforms: PlatformStatus[];
};

export type InstallResult = {
  ok: boolean;
  platform?: string;
  pipExtra?: string;
  output?: string;
  error?: string;
  needsExternal?: boolean;
  externalDep?: string;
};

function getBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, withHermesHeaders(init));
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchMessengersStatus(
  port: number,
): Promise<MessengersResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/messengers`);
}

export async function installMessengerDeps(
  port: number,
  platform: string,
): Promise<InstallResult> {
  return fetchJson(`${getBaseUrl(port)}/api/messengers/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform }),
    signal: AbortSignal.timeout(600_000),
  });
}

export async function restartGateway(
  port: number,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  return fetchJson(`${getBaseUrl(port)}/api/gateway/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}
