import { ipcMain, type BrowserWindow } from "electron";

import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  listTerminals,
  getTerminalBuffer,
  type CreateTerminalParams,
} from "./pty-manager";

/**
 * Register IPC handlers for the embedded terminal (multi-session PTY).
 */
export function registerTerminalIpcHandlers(params: {
  getMainWindow: () => BrowserWindow | null;
  stateDir: string;
}) {
  const baseParams: CreateTerminalParams = {
    getMainWindow: params.getMainWindow,
    stateDir: params.stateDir,
  };

  ipcMain.handle("terminal:create", async () => {
    return createTerminal(baseParams);
  });

  ipcMain.handle("terminal:write", async (_evt, p: { id?: unknown; data?: unknown }) => {
    const id = typeof p?.id === "string" ? p.id : "";
    const data = typeof p?.data === "string" ? p.data : "";
    if (id && data) {
      writeTerminal(id, data);
    }
  });

  ipcMain.handle(
    "terminal:resize",
    async (_evt, p: { id?: unknown; cols?: unknown; rows?: unknown }) => {
      const id = typeof p?.id === "string" ? p.id : "";
      const cols = typeof p?.cols === "number" ? p.cols : 80;
      const rows = typeof p?.rows === "number" ? p.rows : 24;
      if (id) {
        resizeTerminal(id, cols, rows);
      }
    },
  );

  ipcMain.handle("terminal:kill", async (_evt, p: { id?: unknown }) => {
    const id = typeof p?.id === "string" ? p.id : "";
    if (id) {
      killTerminal(id);
    }
  });

  ipcMain.handle("terminal:list", async () => {
    return listTerminals();
  });

  ipcMain.handle("terminal:get-buffer", async (_evt, p: { id?: unknown }) => {
    const id = typeof p?.id === "string" ? p.id : "";
    if (!id) {
      return "";
    }
    return getTerminalBuffer(id);
  });
}
