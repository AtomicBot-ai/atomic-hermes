import { ipcMain } from "electron";

import {
  listDirectory,
  readFileContent,
  writeFileContent,
  createDirectory,
  renameEntry,
  deleteEntry,
} from "./operations";

export function registerFilesIpcHandlers(params: { stateDir: string }) {
  const { stateDir } = params;

  ipcMain.handle("files:list-dir", async (_evt, p: { path?: unknown }) => {
    const rel = typeof p?.path === "string" ? p.path : ".";
    return listDirectory(stateDir, rel);
  });

  ipcMain.handle("files:read-file", async (_evt, p: { path?: unknown }) => {
    const rel = typeof p?.path === "string" ? p.path : "";
    if (!rel) throw new Error("path is required");
    return readFileContent(stateDir, rel);
  });

  ipcMain.handle(
    "files:write-file",
    async (_evt, p: { path?: unknown; content?: unknown }) => {
      const rel = typeof p?.path === "string" ? p.path : "";
      const content = typeof p?.content === "string" ? p.content : "";
      if (!rel) throw new Error("path is required");
      writeFileContent(stateDir, rel, content);
      return { ok: true };
    },
  );

  ipcMain.handle("files:create-dir", async (_evt, p: { path?: unknown }) => {
    const rel = typeof p?.path === "string" ? p.path : "";
    if (!rel) throw new Error("path is required");
    createDirectory(stateDir, rel);
    return { ok: true };
  });

  ipcMain.handle(
    "files:rename",
    async (_evt, p: { oldPath?: unknown; newPath?: unknown }) => {
      const oldRel = typeof p?.oldPath === "string" ? p.oldPath : "";
      const newRel = typeof p?.newPath === "string" ? p.newPath : "";
      if (!oldRel || !newRel) throw new Error("oldPath and newPath are required");
      renameEntry(stateDir, oldRel, newRel);
      return { ok: true };
    },
  );

  ipcMain.handle("files:delete", async (_evt, p: { path?: unknown }) => {
    const rel = typeof p?.path === "string" ? p.path : "";
    if (!rel) throw new Error("path is required");
    deleteEntry(stateDir, rel);
    return { ok: true };
  });
}
