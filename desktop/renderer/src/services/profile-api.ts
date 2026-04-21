import { getBaseUrl } from "./api";
import {
  getOrCreateHermesClientId,
  setSelectedHermesProfile,
  withHermesHeaders,
} from "./request-context";

export type ProfileSummary = {
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
  gatewayRunning: boolean;
  model: string | null;
  provider: string | null;
  hasEnv: boolean;
  skillCount: number;
  aliasPath: string | null;
  stickyDefault: boolean;
};

export type ProfilesResponse = {
  profiles: ProfileSummary[];
  selectedProfile: string | null;
  hostProfile: string | null;
};

export type CreateProfileResponse = {
  ok: boolean;
  profile?: {
    id: string;
    path: string;
    skillsSeeded?: {
      copied: number;
      updated: number;
      userModified: number;
    } | null;
  };
  error?: string;
};

export async function fetchProfiles(port: number): Promise<ProfilesResponse> {
  const clientId = getOrCreateHermesClientId();
  const res = await fetch(`${getBaseUrl(port)}/api/profiles?client_id=${encodeURIComponent(clientId)}`, {
    ...withHermesHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fetchProfiles: HTTP ${res.status}${text ? `: ${text}` : ""}`);
  }
  return res.json() as Promise<ProfilesResponse>;
}

export async function selectProfile(
  port: number,
  profileId: string,
): Promise<{ ok: boolean; clientId: string; selectedProfile: string }> {
  const clientId = getOrCreateHermesClientId();
  const res = await fetch(`${getBaseUrl(port)}/api/profiles/session/select`, {
    ...withHermesHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        profile: profileId,
      }),
      signal: AbortSignal.timeout(10_000),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`selectProfile: HTTP ${res.status}${text ? `: ${text}` : ""}`);
  }
  const payload = (await res.json()) as {
    ok: boolean;
    clientId: string;
    selectedProfile: string;
  };
  if (payload.ok && payload.selectedProfile) {
    setSelectedHermesProfile(payload.selectedProfile);
  }
  return payload;
}

function normalizeProfileName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

export async function createProfile(
  port: number,
  name: string,
  opts?: { cloneFrom?: string; cloneAll?: boolean; cloneConfig?: boolean },
): Promise<CreateProfileResponse> {
  const body: Record<string, unknown> = { name: normalizeProfileName(name) };
  if (opts?.cloneFrom) body.cloneFrom = opts.cloneFrom;
  if (opts?.cloneAll) body.cloneAll = true;
  if (opts?.cloneConfig) body.cloneConfig = true;

  const res = await fetch(`${getBaseUrl(port)}/api/profiles`, {
    ...withHermesHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`createProfile: HTTP ${res.status}${text ? `: ${text}` : ""}`);
  }
  return res.json() as Promise<CreateProfileResponse>;
}

export type DeleteProfileResponse = {
  ok: boolean;
  profile?: {
    id: string;
    path: string;
    log?: string;
  };
  workerStopped?: boolean;
  clearedSelections?: number;
  error?: string;
};

export async function deleteProfile(
  port: number,
  profileId: string,
): Promise<DeleteProfileResponse> {
  const res = await fetch(
    `${getBaseUrl(port)}/api/profiles/${encodeURIComponent(profileId)}`,
    {
      ...withHermesHeaders({
        method: "DELETE",
        signal: AbortSignal.timeout(30_000),
      }),
    },
  );
  const payload = (await res.json().catch(() => ({}))) as DeleteProfileResponse;
  if (!res.ok) {
    const message = payload.error || `HTTP ${res.status}`;
    throw new Error(`deleteProfile: ${message}`);
  }
  return payload;
}
