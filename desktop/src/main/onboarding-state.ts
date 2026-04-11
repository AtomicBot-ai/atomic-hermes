import * as fs from "node:fs";
import * as path from "node:path";

const STATE_FILE = "desktop-onboarding-state.json";

export function readOnboardedState(stateDir: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(stateDir, STATE_FILE), "utf-8");
    const parsed = JSON.parse(raw) as { onboarded?: unknown };
    return parsed.onboarded === true;
  } catch {
    return false;
  }
}

export function writeOnboardedState(
  stateDir: string,
  onboarded: boolean,
): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, STATE_FILE),
    JSON.stringify({ onboarded, updatedAt: new Date().toISOString() }),
  );
}

export function clearOnboardedState(stateDir: string): void {
  try {
    fs.unlinkSync(path.join(stateDir, STATE_FILE));
  } catch {
    // File may already be absent.
  }
}
