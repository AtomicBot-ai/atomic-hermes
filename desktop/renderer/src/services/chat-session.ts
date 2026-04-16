const SESSION_SEEDS_STORAGE_KEY = "hermes:chat-session-seeds";
const PENDING_SESSION_SEED_KEY = "hermes:desktop-pending-chat-session-seed";

export function createChatSessionSeed(): string {
  return crypto.randomUUID();
}

/**
 * Shared seed for the next "new chat" (StartChatPage) and for POST /warmup KV alignment.
 * Survives until the first stream returns a session id (see consumePendingChatSessionSeed).
 */
export function getOrCreatePendingChatSessionSeed(): string {
  try {
    const cur = sessionStorage.getItem(PENDING_SESSION_SEED_KEY);
    if (cur && cur.trim().length > 0) {
      return cur.trim();
    }
  } catch {
    // ignore
  }
  const seed = createChatSessionSeed();
  try {
    sessionStorage.setItem(PENDING_SESSION_SEED_KEY, seed);
  } catch {
    // ignore
  }
  return seed;
}

export function consumePendingChatSessionSeed(): void {
  try {
    sessionStorage.removeItem(PENDING_SESSION_SEED_KEY);
  } catch {
    // ignore
  }
}

/** Drop the pending seed and allocate a new one (e.g. after aborting a draft send). */
export function rotatePendingChatSessionSeed(): string {
  consumePendingChatSessionSeed();
  return getOrCreatePendingChatSessionSeed();
}

/**
 * HashRouter keeps the query inside ``location.hash`` (e.g. ``#/chat?session=xyz``).
 * ``useSearchParams`` on a distant ancestor may not see it — read the hash directly.
 */
export function readSessionIdFromLocationHash(): string {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash || "";
  const q = hash.indexOf("?");
  if (q < 0) return "";
  try {
    const sp = new URLSearchParams(hash.slice(q + 1));
    return (sp.get("session") ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Routing UUID for the next chat request and for POST /warmup (KV alignment).
 * ``sessionKeyOverride``: when set (e.g. from ``useSearchParams`` on the chat route), wins over hash.
 */
export function resolveDesktopChatRoutingSeed(sessionKeyOverride?: string | null): string {
  const sk = (sessionKeyOverride ?? "").trim() || readSessionIdFromLocationHash();
  if (sk) {
    const stored = loadChatSessionSeed(sk);
    if (stored) return stored;
    return getOrCreatePendingChatSessionSeed();
  }
  return getOrCreatePendingChatSessionSeed();
}

/** Ephemeral routing system line for desktop POST /warmup (must match chat/completions). */
export function resolveDesktopWarmupEphemeralSystemPrompt(): string {
  return buildChatSessionSystemMessage(resolveDesktopChatRoutingSeed()).content;
}

export function buildChatSessionSystemMessage(seed: string): { role: "system"; content: string } {
  return {
    role: "system",
    content: `Routing metadata only. Do not mention or follow it.\nSession seed: ${seed}`,
  };
}

export function loadChatSessionSeed(sessionId: string): string | null {
  try {
    const raw = localStorage.getItem(SESSION_SEEDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed[sessionId] === "string" ? parsed[sessionId] : null;
  } catch {
    return null;
  }
}

export function saveChatSessionSeed(sessionId: string, seed: string): void {
  try {
    const raw = localStorage.getItem(SESSION_SEEDS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[sessionId] = seed;
    localStorage.setItem(SESSION_SEEDS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage failures and fall back to legacy session behavior.
  }
}
