import type { AtomicPaygBackup, LocalModelBackup, SelfManagedBackup } from "./auth-types";

const LS_ATOMIC_PAYG = "hermes-desktop-backup-atomic-payg";
const LS_SELF_MANAGED = "hermes-desktop-backup-self-managed";
const LS_LOCAL_MODEL = "hermes-desktop-backup-local-model";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best effort
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function readAtomicPaygBackup(): AtomicPaygBackup | null {
  return readJson<AtomicPaygBackup>(LS_ATOMIC_PAYG);
}

export function saveAtomicPaygBackup(backup: AtomicPaygBackup): void {
  writeJson(LS_ATOMIC_PAYG, backup);
}

export function clearAtomicPaygBackup(): void {
  removeKey(LS_ATOMIC_PAYG);
}

export function readSelfManagedBackup(): SelfManagedBackup | null {
  return readJson<SelfManagedBackup>(LS_SELF_MANAGED);
}

export function saveSelfManagedBackup(backup: SelfManagedBackup): void {
  writeJson(LS_SELF_MANAGED, backup);
}

export function clearSelfManagedBackup(): void {
  removeKey(LS_SELF_MANAGED);
}

export function readLocalModelBackup(): LocalModelBackup | null {
  return readJson<LocalModelBackup>(LS_LOCAL_MODEL);
}

export function saveLocalModelBackup(backup: LocalModelBackup): void {
  writeJson(LS_LOCAL_MODEL, backup);
}

export function clearLocalModelBackup(): void {
  removeKey(LS_LOCAL_MODEL);
}
