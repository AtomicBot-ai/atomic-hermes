const SESSION_SEEDS_STORAGE_KEY = "hermes:chat-session-seeds";

export function createChatSessionSeed(): string {
  return crypto.randomUUID();
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
