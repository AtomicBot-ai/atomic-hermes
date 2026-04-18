import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

import { listProfiles } from "../files/profile-resolver";
import { LLAMACPP_DEFAULT_PORT } from "./server";

const LLAMACPP_BASE_URL_MARKER = `127.0.0.1:${LLAMACPP_DEFAULT_PORT}`;

/**
 * A profile targets the bundled llama.cpp OpenAI-compatible endpoint when its
 * `config.yaml` has `model.provider: custom` and a `model.base_url` pointing
 * at the local server port. Mirrors the renderer-side
 * `isProfileUsingLlamacppServer()` which reads `config.model.base_url`.
 */
export function isAnyProfileUsingLlamacpp(stateDir: string): boolean {
  const profiles = listProfiles(stateDir);

  for (const profile of profiles) {
    const configPath = path.join(profile.profileHome, "config.yaml");
    if (!fs.existsSync(configPath)) continue;

    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const doc = yaml.load(raw) as Record<string, unknown> | null;
      if (!doc || typeof doc !== "object") continue;

      const modelSection = doc.model;
      if (typeof modelSection !== "object" || modelSection === null) continue;

      const { provider, base_url: baseUrl } = modelSection as Record<string, unknown>;

      if (provider === "custom" && String(baseUrl ?? "").includes(LLAMACPP_BASE_URL_MARKER)) {
        return true;
      }
    } catch (err) {
      console.warn(`[llamacpp] profile-usage read failed for ${profile.name}:`, err);
    }
  }

  return false;
}
