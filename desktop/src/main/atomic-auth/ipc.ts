import { ipcMain } from "electron";
import {
  type AtomicAuthState,
  clearAtomicAuth,
  readAtomicAuth,
  writeAtomicAuth,
} from "./jwt-storage";

export const ATOMIC_AUTH_IPC = {
  getJwt: "atomic-auth:get",
  setJwt: "atomic-auth:set",
  clearJwt: "atomic-auth:clear",
} as const;

export function registerAtomicAuthIpcHandlers(params: { stateDir: string }): void {
  const { stateDir } = params;

  ipcMain.handle(ATOMIC_AUTH_IPC.getJwt, () => {
    return readAtomicAuth(stateDir);
  });

  ipcMain.handle(ATOMIC_AUTH_IPC.setJwt, (_evt, payload: AtomicAuthState) => {
    if (!payload || typeof payload.jwt !== "string" || !payload.jwt.trim()) {
      throw new Error("jwt is required");
    }
    if (typeof payload.userId !== "string" || !payload.userId.trim()) {
      throw new Error("userId is required");
    }
    writeAtomicAuth(stateDir, {
      jwt: payload.jwt.trim(),
      email: typeof payload.email === "string" ? payload.email : "",
      userId: payload.userId.trim(),
    });
    return { ok: true };
  });

  ipcMain.handle(ATOMIC_AUTH_IPC.clearJwt, () => {
    clearAtomicAuth(stateDir);
    return { ok: true };
  });
}
