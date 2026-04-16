import type { ConfigResponse } from "../../services/api";
import { getConfigString } from "./settings-state";

const LLAMACPP_HOST_MARKER = "127.0.0.1:18791";

/** True when the saved Hermes profile targets the bundled llama.cpp OpenAI-compatible endpoint. */
export function isProfileUsingLlamacppServer(configSnap: ConfigResponse | null): boolean {
  if (!configSnap || configSnap.activeProvider !== "custom") return false;
  const modelSection = configSnap.config?.model;
  if (typeof modelSection !== "object" || modelSection === null) return false;
  const baseUrl = getConfigString(modelSection as Record<string, unknown>, "base_url");
  return baseUrl.includes(LLAMACPP_HOST_MARKER);
}

/** Catalog model id from `activeModel` (e.g. `llamacpp/qwen-3.5-9b`) when it is a local llamacpp entry. */
export function profileLlamacppCatalogModelId(activeModel: string): string | null {
  const t = activeModel.trim();
  const m = /^llamacpp\/(.+)$/i.exec(t);
  const id = m?.[1]?.trim();
  return id || null;
}
