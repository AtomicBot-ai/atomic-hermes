import { patchConfig } from "../../../services/api";
import { atomicBackendApi, isUnauthorizedError } from "../../../services/atomic-backend-api";
import type { ModeHandler, SwitchContext, ModeSetupResult } from "./auth-types";
import {
  clearAtomicPaygBackup,
  readAtomicPaygBackup,
  saveAtomicPaygBackup,
} from "./mode-backups";

export const atomicPaygHandler: ModeHandler = {
  async saveBackup(ctx: SwitchContext): Promise<void> {
    if (readAtomicPaygBackup()) return;

    const { jwt, email, userId } = ctx.getState().atomicAuth;
    if (!jwt || !userId) return;

    saveAtomicPaygBackup({
      auth: { jwt, email: email ?? "", userId },
      savedAt: new Date().toISOString(),
    });
  },

  async teardown(ctx: SwitchContext): Promise<void> {
    try {
      await patchConfig(ctx.port, {
        env: { OPENROUTER_API_KEY: "" },
      });
    } catch (err) {
      console.warn("[atomicPaygHandler] teardown patchConfig failed:", err);
    }
  },

  async setup(ctx: SwitchContext): Promise<ModeSetupResult> {
    const backup = readAtomicPaygBackup();
    if (!backup?.auth?.jwt) {
      return {};
    }

    try {
      await atomicBackendApi.getMe(backup.auth.jwt);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        console.warn("[atomicPaygHandler] Backup JWT invalid, discarding backup");
      } else {
        console.warn("[atomicPaygHandler] getMe failed:", err);
      }
      clearAtomicPaygBackup();
      return {};
    }

    clearAtomicPaygBackup();
    return {
      hasBackup: true,
      restoredAuth: backup.auth,
      needsApplyPaygKey: true,
    };
  },
};
