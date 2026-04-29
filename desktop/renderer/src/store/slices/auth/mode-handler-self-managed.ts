import type { ConfigResponse } from "../../../services/api";
import { getConfig, patchConfig } from "../../../services/api";
import type { ModeHandler, SwitchContext, ModeSetupResult } from "./auth-types";
import {
  clearSelfManagedBackup,
  readSelfManagedBackup,
  saveSelfManagedBackup,
} from "./mode-backups";

function readBaseUrlFromSnap(snap: ConfigResponse): string {
  const cfg = snap.config;
  if (!cfg || typeof cfg !== "object") return "";
  const root = typeof cfg.base_url === "string" ? cfg.base_url : "";
  const modelSection = cfg.model;
  if (typeof modelSection === "object" && modelSection !== null) {
    const nested = (modelSection as Record<string, unknown>).base_url;
    if (typeof nested === "string" && nested.trim()) return nested;
  }
  return root;
}

export const selfManagedHandler: ModeHandler = {
  async saveBackup(ctx: SwitchContext): Promise<void> {
    if (readSelfManagedBackup()) return;

    try {
      const snap = await getConfig(ctx.port);
      saveSelfManagedBackup({
        activeProvider: snap.activeProvider || "",
        activeModel: snap.activeModel || "",
        baseUrl: readBaseUrlFromSnap(snap),
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("[selfManagedHandler] saveBackup getConfig failed:", err);
    }
  },

  async teardown(_ctx: SwitchContext): Promise<void> {
    // Env API keys stay on disk so the user can return to self-managed without
    // re-entering secrets. Switching to atomic-payg overwrites OpenRouter only.
  },

  async setup(ctx: SwitchContext): Promise<ModeSetupResult> {
    const backup = readSelfManagedBackup();
    if (!backup?.activeProvider) {
      return { hasBackup: false };
    }

    try {
      const body: { config: Record<string, unknown> } = {
        config: {
          provider: backup.activeProvider,
          model: backup.activeModel,
        },
      };
      if (backup.baseUrl.trim()) {
        body.config.base_url = backup.baseUrl.trim();
      }
      await patchConfig(ctx.port, body);
    } catch (err) {
      console.warn("[selfManagedHandler] setup patchConfig failed:", err);
    }

    clearSelfManagedBackup();
    return { hasBackup: true };
  },
};
