export type HermesSetupMode = "self-managed" | "local-model" | "atomic-payg";

export const MODE_LABELS: Record<HermesSetupMode, string> = {
  "self-managed": "API keys",
  "local-model": "Local Models",
  "atomic-payg": "Pay as you go",
};

const MODE_LS_KEY = "hermes-desktop-mode";

export function persistMode(mode: HermesSetupMode): void {
  try {
    localStorage.setItem(MODE_LS_KEY, mode);
  } catch {
    // best effort
  }
}

export function readPersistedMode(): HermesSetupMode | null {
  try {
    const val = localStorage.getItem(MODE_LS_KEY);
    if (val === "self-managed" || val === "local-model" || val === "atomic-payg") {
      return val;
    }
    return null;
  } catch {
    return null;
  }
}
