import * as fs from "node:fs";
import * as path from "node:path";

export type NotificationsState = {
  enabled: boolean;
};

const FILE_NAME = "notifications-state.json";
const DEFAULT_STATE: NotificationsState = { enabled: true };

function getFilePath(stateDir: string): string {
  return path.join(stateDir, FILE_NAME);
}

export function readNotificationsState(stateDir: string): NotificationsState {
  const filePath = getFilePath(stateDir);
  try {
    if (!fs.existsSync(filePath)) {
      return { ...DEFAULT_STATE };
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_STATE };
    }
    const obj = parsed as Partial<NotificationsState>;
    return {
      enabled: obj.enabled !== false,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeNotificationsState(stateDir: string, state: NotificationsState): void {
  const filePath = getFilePath(stateDir);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  } catch (err) {
    console.warn("[main] writeNotificationsState failed:", err);
  }
}

export function isNotificationsEnabled(stateDir: string): boolean {
  return readNotificationsState(stateDir).enabled;
}
