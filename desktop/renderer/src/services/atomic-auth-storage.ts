/**
 * Renderer-side persistence for the Atomic Pay-as-you-go auth state.
 *
 * Stored in `window.localStorage` (Electron LevelDB profile, not the OS
 * keystore). This is a deliberate downgrade from `safeStorage` to avoid the
 * keystore unlock prompt — the JWT can always be re-issued via the OAuth
 * deep-link flow if the storage is wiped.
 */

const STORAGE_KEY = "atomic-auth";

export type AtomicAuthState = {
  jwt: string;
  email: string;
  userId: string;
};

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isAtomicAuthState(value: unknown): value is AtomicAuthState {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.jwt === "string" &&
    obj.jwt.length > 0 &&
    typeof obj.userId === "string" &&
    obj.userId.length > 0 &&
    (typeof obj.email === "string" || obj.email === undefined)
  );
}

export function readAtomicAuth(): AtomicAuthState | null {
  const storage = getStorage();
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[atomic-auth-storage] read failed:", err);
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isAtomicAuthState(parsed)) return null;
    return {
      jwt: parsed.jwt,
      email: parsed.email ?? "",
      userId: parsed.userId,
    };
  } catch (err) {
    console.warn("[atomic-auth-storage] parse failed:", err);
    return null;
  }
}

export function writeAtomicAuth(state: AtomicAuthState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[atomic-auth-storage] write failed:", err);
  }
}

export function clearAtomicAuth(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[atomic-auth-storage] clear failed:", err);
  }
}
