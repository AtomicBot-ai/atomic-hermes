import { searchHub } from "./skills-api";

// Deduplicate across React StrictMode remounts and repeated ready events.
let lastWarmedPort: number | null = null;

/**
 * Primes the gateway Python skills hub index cache after the UI is up.
 * Runs deferred so it does not compete with first paint or navigation.
 */
export function scheduleWarmHubSkillsCache(port: number): void {
  if (lastWarmedPort === port) return;
  lastWarmedPort = port;

  const run = () => {
    void searchHub(port, "", 1, "downloads").catch(() => {
      // Offline, auth, or hub errors — warmup is best-effort only.
    });
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => run(), { timeout: 8000 });
  } else {
    window.setTimeout(run, 2000);
  }
}
