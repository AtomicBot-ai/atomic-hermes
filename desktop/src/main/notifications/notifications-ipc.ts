import { ipcMain } from "electron";

import { readNotificationsState, writeNotificationsState } from "./notifications-state";

export function registerNotificationsHandlers({ stateDir }: { stateDir: string }): void {
  ipcMain.handle("notifications-get", async () => {
    const state = readNotificationsState(stateDir);
    return { enabled: state.enabled };
  });

  ipcMain.handle("notifications-set", async (_evt, { enabled }: { enabled: boolean }) => {
    writeNotificationsState(stateDir, { enabled: enabled === true });
    return { ok: true as const };
  });
}
