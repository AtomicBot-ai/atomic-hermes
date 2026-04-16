const CLIENT_ID_STORAGE_KEY = "hermes:desktop-client-id";
const SELECTED_PROFILE_STORAGE_KEY = "hermes:selected-profile";

let fallbackClientId: string | null = null;

function createClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `desktop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateHermesClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const nextId = createClientId();
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    if (!fallbackClientId) {
      fallbackClientId = createClientId();
    }
    return fallbackClientId;
  }
}

export function getSelectedHermesProfile(): string | null {
  try {
    const value = localStorage.getItem(SELECTED_PROFILE_STORAGE_KEY);
    return value?.trim() ? value : null;
  } catch {
    return null;
  }
}

export function setSelectedHermesProfile(profileId: string | null): void {
  try {
    if (profileId?.trim()) {
      localStorage.setItem(SELECTED_PROFILE_STORAGE_KEY, profileId);
      return;
    }
    localStorage.removeItem(SELECTED_PROFILE_STORAGE_KEY);
  } catch {
    // Ignore storage failures and fall back to request-level defaults.
  }
}

export function buildHermesHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("X-Hermes-Client-Id", getOrCreateHermesClientId());

  const selectedProfile = getSelectedHermesProfile();
  if (selectedProfile) {
    nextHeaders.set("X-Hermes-Profile", selectedProfile);
  }

  return nextHeaders;
}

export function withHermesHeaders(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: buildHermesHeaders(init?.headers),
  };
}

/** Same as withHermesHeaders but forces X-Hermes-Profile (avoids stale localStorage vs. server selection). */
export function withHermesHeadersForProfile(profileId: string, init?: RequestInit): RequestInit {
  const merged = withHermesHeaders(init);
  const headers = new Headers(merged.headers);
  headers.set("X-Hermes-Profile", profileId);
  return { ...merged, headers };
}
