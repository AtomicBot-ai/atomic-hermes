import { getBaseUrl } from "./api";
import { withHermesHeaders } from "./request-context";

// ── Types ────────────────────────────────────────────────────────────────

export type SkillSummary = {
  trigger: string;
  name: string;
  description: string;
  path: string;
  dirName: string;
  enabled: boolean;
  category: string;
  author: string;
  tags: string[];
  emoji: string;
};

export type SkillsResponse = {
  skills: SkillSummary[];
  total: number;
};

export type SkillDetail = {
  success: boolean;
  name?: string;
  content?: string;
  description?: string;
  tags?: string[];
  category?: string;
  author?: string;
  linked_files?: string[];
  file_count?: number;
  error?: string;
};

export type SkillActionResponse = {
  ok: boolean;
  error?: string;
};

export type HubSkillItem = {
  slug: string;
  name: string;
  displayName?: string;
  summary?: string;
  description?: string;
  emoji?: string;
  author?: string;
  source?: string;
  identifier?: string;
  trust_level?: string;
  repo?: string | null;
  tags?: string[];
  installed?: boolean;
  downloads?: number;
  stars?: number;
};

export type HubSearchResponse = {
  ok: boolean;
  results: HubSkillItem[];
  total: number;
  error?: string;
};

// ── Fetch helpers ────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, withHermesHeaders(init));
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── API functions ────────────────────────────────────────────────────────

export async function fetchSkills(port: number): Promise<SkillsResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/skills`);
}

export async function fetchSkillDetail(port: number, name: string): Promise<SkillDetail> {
  return fetchJson(`${getBaseUrl(port)}/api/skills/${encodeURIComponent(name)}`);
}

export async function toggleSkill(
  port: number,
  name: string,
  enabled: boolean,
): Promise<SkillActionResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/skills/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, enabled }),
  });
}

export async function installSkill(
  port: number,
  identifier: string,
): Promise<SkillActionResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/skills/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
}

export async function uninstallSkill(
  port: number,
  name: string,
): Promise<SkillActionResponse> {
  return fetchJson(`${getBaseUrl(port)}/api/skills/uninstall`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function searchHub(
  port: number,
  query: string,
  limit = 20,
  sort = "downloads",
): Promise<HubSearchResponse> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("limit", String(limit));
  params.set("sort", sort);
  return fetchJson(`${getBaseUrl(port)}/api/skills/hub-search?${params.toString()}`);
}
