import { ipcMain } from "electron";
import { readAnalyticsState, writeAnalyticsState } from "./analytics-state";
import { optInMain, optOutMain } from "./posthog-main";

export function registerAnalyticsHandlers({ stateDir }: { stateDir: string }): void {
  ipcMain.handle("analytics-get", async () => {
    const state = readAnalyticsState(stateDir);
    return { enabled: state.enabled, userId: state.userId, prompted: state.prompted === true };
  });

  ipcMain.handle("analytics-set", async (_evt, { enabled }: { enabled: boolean }) => {
    const current = readAnalyticsState(stateDir);
    const next = {
      ...current,
      enabled,
      prompted: true,
      enabledAt: enabled ? (current.enabledAt ?? new Date().toISOString()) : undefined,
    };
    writeAnalyticsState(stateDir, next);

    if (enabled) {
      optInMain(current.userId);
    } else {
      optOutMain();
    }

    return { ok: true as const };
  });
}
