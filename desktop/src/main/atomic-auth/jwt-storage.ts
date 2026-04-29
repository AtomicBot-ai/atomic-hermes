import { safeStorage } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

export type AtomicAuthState = {
  jwt: string;
  email: string;
  userId: string;
};

type StoredFile = {
  version: 1;
  /** base64-encoded ciphertext from safeStorage.encryptString. */
  encrypted?: string;
  /** Plaintext fallback when safeStorage encryption is unavailable. */
  plaintext?: AtomicAuthState;
};

const FILE_NAME = "atomic-auth.json";

function getFilePath(stateDir: string): string {
  return path.join(stateDir, FILE_NAME);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function restrictPermissions(filePath: string): void {
  if (process.platform === "win32") return;
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (err) {
    console.warn("[atomic-auth] chmod failed:", err);
  }
}

export function readAtomicAuth(stateDir: string): AtomicAuthState | null {
  const filePath = getFilePath(stateDir);
  if (!fs.existsSync(filePath)) return null;

  let raw: StoredFile;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as StoredFile;
  } catch (err) {
    console.warn("[atomic-auth] read parse failed:", err);
    return null;
  }

  if (raw.encrypted && safeStorage.isEncryptionAvailable()) {
    try {
      const buf = Buffer.from(raw.encrypted, "base64");
      const json = safeStorage.decryptString(buf);
      const parsed = JSON.parse(json) as AtomicAuthState;
      if (parsed.jwt && parsed.userId) return parsed;
    } catch (err) {
      console.warn("[atomic-auth] decrypt failed:", err);
    }
  }

  if (raw.plaintext?.jwt && raw.plaintext.userId) {
    return raw.plaintext;
  }
  return null;
}

export function writeAtomicAuth(stateDir: string, state: AtomicAuthState): void {
  ensureDir(stateDir);
  const filePath = getFilePath(stateDir);

  const payload: StoredFile = { version: 1 };
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const cipher = safeStorage.encryptString(JSON.stringify(state));
      payload.encrypted = cipher.toString("base64");
    } catch (err) {
      console.warn("[atomic-auth] encrypt failed, falling back to plaintext:", err);
      payload.plaintext = state;
    }
  } else {
    payload.plaintext = state;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf-8" });
  restrictPermissions(filePath);
}

export function clearAtomicAuth(stateDir: string): void {
  const filePath = getFilePath(stateDir);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("[atomic-auth] clear failed:", err);
  }
}
