import * as fs from "node:fs";
import * as path from "node:path";
import { PostHog } from "posthog-node";

const POSTHOG_HOST = "https://us.i.posthog.com";

let client: PostHog | null = null;
let currentUserId: string | null = null;

/**
 * Resolve the PostHog API key. In production builds the value is inlined by
 * scripts/define-main-env.mjs via esbuild --define. In dev the env var may be
 * absent, so we fall back to reading the .env file next to package.json.
 */
function resolveApiKey(): string {
  const fromEnv = process.env.POSTHOG_API_KEY ?? "";
  if (fromEnv) return fromEnv;

  try {
    const envFile = path.resolve(__dirname, "..", "..", "..", ".env");
    if (!fs.existsSync(envFile)) return "";
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const m = line.match(/^\s*(?:VITE_)?POSTHOG_API_KEY=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Best-effort.
  }
  return "";
}

const POSTHOG_API_KEY = resolveApiKey();

function createClient(): PostHog | null {
  if (!POSTHOG_API_KEY) {
    console.warn("[analytics] PostHog API key is not configured — main analytics disabled");
    return null;
  }
  return new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    flushAt: 20,
    flushInterval: 10_000,
    disableGeoip: true,
  });
}

export function initPosthogMain(userId: string, enabled: boolean): void {
  currentUserId = userId;
  if (!enabled) {
    return;
  }
  client = createClient();
  if (client) {
    client.identify({ distinctId: userId });
  }
}

/** Capture an event from the main process. Safe to call even if analytics is disabled. */
export function captureMain(event: string, properties?: Record<string, unknown>): void {
  if (!client || !currentUserId) {
    return;
  }
  try {
    client.capture({ distinctId: currentUserId, event, properties });
  } catch {
    // Never let analytics errors surface to the user.
  }
}

/** Enable analytics and (re-)initialize the PostHog client. */
export function optInMain(userId: string): void {
  currentUserId = userId;
  if (client) {
    return;
  }
  client = createClient();
  if (client) {
    client.identify({ distinctId: userId });
  }
}

/** Disable analytics and shut down the PostHog client. */
export function optOutMain(): void {
  if (!client) {
    return;
  }
  void client.shutdown();
  client = null;
}

/** Flush remaining events and shut down. Call on app quit. */
export async function shutdownPosthogMain(): Promise<void> {
  if (!client) {
    return;
  }
  try {
    await client.shutdown();
  } catch {
    // Best-effort flush.
  }
  client = null;
}
