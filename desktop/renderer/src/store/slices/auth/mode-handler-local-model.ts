import type { ModeHandler, SwitchContext, ModeSetupResult } from "./auth-types";
import {
  clearLocalModelBackup,
  readLocalModelBackup,
  saveLocalModelBackup,
} from "./mode-backups";
import { llamacppActions, stopLlamacppServer } from "../llamacppSlice";

export const localModelHandler: ModeHandler = {
  async saveBackup(ctx: SwitchContext): Promise<void> {
    const activeModelId = ctx.getState().llamacpp.activeModelId;
    if (!activeModelId) return;
    saveLocalModelBackup({
      activeModelId,
      savedAt: new Date().toISOString(),
    });
  },

  async teardown(ctx: SwitchContext): Promise<void> {
    try {
      await ctx.dispatch(stopLlamacppServer()).unwrap();
    } catch (err) {
      console.warn("[localModelHandler] stopLlamacppServer:", err);
    }
    ctx.dispatch(llamacppActions.setActiveModelId(null));
  },

  async setup(ctx: SwitchContext): Promise<ModeSetupResult> {
    const backup = readLocalModelBackup();
    const hasBackup = Boolean(backup?.activeModelId);
    if (backup?.activeModelId) {
      ctx.dispatch(llamacppActions.setActiveModelId(backup.activeModelId));
    }
    clearLocalModelBackup();
    return { hasBackup };
  },
};
