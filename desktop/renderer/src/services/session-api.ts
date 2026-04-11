import { getBaseUrl } from "./api";

export type SessionListItem = {
  key: string;
  kind: string;
  label?: string | null;
  derivedTitle?: string | null;
  lastMessagePreview?: string | null;
  updatedAt: number | string | null;
  messageCount: number;
  model?: string | null;
};

export type SessionsResponse = {
  sessions: SessionListItem[];
  total: number;
  error?: string;
};

export type SessionMessage = {
  id: number;
  session_id: string;
  role: string;
  content: string | null;
  tool_name?: string | null;
  tool_calls?: unknown[];
  timestamp: string;
  [key: string]: unknown;
};

export type SessionMessagesResponse = {
  sessionKey: string;
  messages: SessionMessage[];
  error?: string;
};

export async function fetchSessions(
  port: number,
  limit = 50,
  offset = 0,
): Promise<SessionsResponse> {
  const url = `${getBaseUrl(port)}/api/sessions?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`fetchSessions: HTTP ${res.status}`);
  }
  return res.json() as Promise<SessionsResponse>;
}

export async function fetchSessionMessages(
  port: number,
  sessionId: string,
): Promise<SessionMessagesResponse> {
  const url = `${getBaseUrl(port)}/api/sessions/${encodeURIComponent(sessionId)}/messages`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`fetchSessionMessages: HTTP ${res.status}`);
  }
  return res.json() as Promise<SessionMessagesResponse>;
}

export async function deleteSession(
  port: number,
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${getBaseUrl(port)}/api/sessions/${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`deleteSession: HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; error?: string }>;
}
