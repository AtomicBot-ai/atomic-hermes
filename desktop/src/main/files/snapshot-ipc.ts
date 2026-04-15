import { ipcMain } from "electron";
import {
  listSnapshots,
  readSnapshot,
  deleteSnapshot,
  restoreSnapshot,
} from "./snapshot-operations";

export function registerSnapshotIpcHandlers(params: { stateDir: string }) {
  const { stateDir } = params;

  ipcMain.handle(
    "files:list-snapshots",
    async (_evt, p: { path?: unknown }) => {
      const rel = typeof p?.path === "string" ? p.path : "";
      if (!rel) throw new Error("path is required");
      return listSnapshots(stateDir, rel);
    },
  );

  ipcMain.handle(
    "files:read-snapshot",
    async (_evt, p: { snapshotPath?: unknown }) => {
      const snapshotPath = typeof p?.snapshotPath === "string" ? p.snapshotPath : "";
      if (!snapshotPath) throw new Error("snapshotPath is required");
      return readSnapshot(stateDir, snapshotPath);
    },
  );

  ipcMain.handle(
    "files:delete-snapshot",
    async (_evt, p: { snapshotPath?: unknown }) => {
      const snapshotPath = typeof p?.snapshotPath === "string" ? p.snapshotPath : "";
      if (!snapshotPath) throw new Error("snapshotPath is required");
      deleteSnapshot(stateDir, snapshotPath);
      return { ok: true };
    },
  );

  ipcMain.handle(
    "files:restore-snapshot",
    async (_evt, p: { path?: unknown; snapshotPath?: unknown }) => {
      const rel = typeof p?.path === "string" ? p.path : "";
      const snapshotPath = typeof p?.snapshotPath === "string" ? p.snapshotPath : "";
      if (!rel || !snapshotPath) throw new Error("path and snapshotPath are required");
      restoreSnapshot(stateDir, rel, snapshotPath);
      return { ok: true };
    },
  );
}
