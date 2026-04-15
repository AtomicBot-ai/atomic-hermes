import * as fs from "fs";
import * as path from "path";
import { safePath } from "./operations";

const HISTORY_DIR = ".history";
const MAX_SNAPSHOT_SIZE = 5 * 1024 * 1024; // 5 MB

export type SnapshotEntry = {
  snapshotPath: string;
  timestamp: number;
  size: number;
  label: string; // e.g. "20260415120530"
};

export type PurgeConfig = {
  maxCount: number; // max snapshots per file, 0 = unlimited
  maxAgeDays: number; // max age in days, 0 = unlimited
};

const DEFAULT_PURGE: PurgeConfig = { maxCount: 50, maxAgeDays: 0 };

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function snapshotDir(root: string, relativePath: string): string {
  const fileName = path.basename(relativePath);
  const dirPart = path.dirname(relativePath);
  return path.join(root, HISTORY_DIR, dirPart, fileName);
}

function buildSnapshotName(relativePath: string, timestamp: Date): string {
  const base = path.basename(relativePath);
  const ext = path.extname(base);
  const name = ext ? base.slice(0, -ext.length) : base;
  return `${name}_${formatTimestamp(timestamp)}${ext}`;
}

export function saveSnapshot(
  root: string,
  relativePath: string,
  content?: string,
): string | null {
  const filePath = safePath(root, relativePath);

  let fileContent: string;
  if (content !== undefined) {
    fileContent = content;
  } else {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_SNAPSHOT_SIZE || stat.size === 0) return null;
      fileContent = fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  const now = new Date();
  const dir = snapshotDir(root, relativePath);
  fs.mkdirSync(dir, { recursive: true });

  const snapshotName = buildSnapshotName(relativePath, now);
  const snapshotFullPath = path.join(dir, snapshotName);

  const tmp = snapshotFullPath + ".tmp." + Date.now();
  fs.writeFileSync(tmp, fileContent, "utf-8");
  fs.renameSync(tmp, snapshotFullPath);

  const snapshotRelative = path.relative(root, snapshotFullPath);
  return snapshotRelative;
}

export function listSnapshots(
  root: string,
  relativePath: string,
): SnapshotEntry[] {
  const dir = snapshotDir(root, relativePath);

  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result: SnapshotEntry[] = [];
  const tsRegex = /_(\d{14})\./;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".tmp")) continue;
    if (entry.name.includes(".tmp.")) continue;

    const match = entry.name.match(tsRegex);
    if (!match) continue;

    const label = match[1];
    const year = parseInt(label.slice(0, 4), 10);
    const month = parseInt(label.slice(4, 6), 10) - 1;
    const day = parseInt(label.slice(6, 8), 10);
    const hour = parseInt(label.slice(8, 10), 10);
    const minute = parseInt(label.slice(10, 12), 10);
    const second = parseInt(label.slice(12, 14), 10);
    const timestamp = new Date(year, month, day, hour, minute, second).getTime();

    try {
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      const snapshotRelPath = path.join(
        HISTORY_DIR,
        path.dirname(relativePath),
        path.basename(relativePath),
        entry.name,
      );
      result.push({ snapshotPath: snapshotRelPath, timestamp, size: stat.size, label });
    } catch {
      // skip unreadable entries
    }
  }

  result.sort((a, b) => b.timestamp - a.timestamp);
  return result;
}

export function readSnapshot(
  root: string,
  snapshotPath: string,
): { content: string; size: number } {
  const target = safePath(root, snapshotPath);
  if (!target.includes(path.sep + HISTORY_DIR + path.sep)) {
    throw new Error("Invalid snapshot path");
  }
  const stat = fs.statSync(target);
  const content = fs.readFileSync(target, "utf-8");
  return { content, size: stat.size };
}

export function deleteSnapshot(root: string, snapshotPath: string): void {
  const target = safePath(root, snapshotPath);
  if (!target.includes(path.sep + HISTORY_DIR + path.sep)) {
    throw new Error("Invalid snapshot path");
  }
  fs.rmSync(target, { force: true });
}

export function restoreSnapshot(
  root: string,
  relativePath: string,
  snapshotPath: string,
): void {
  saveSnapshot(root, relativePath);

  const snapshotContent = readSnapshot(root, snapshotPath);
  const filePath = safePath(root, relativePath);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + ".tmp." + Date.now();
  fs.writeFileSync(tmp, snapshotContent.content, "utf-8");
  fs.renameSync(tmp, filePath);
}

export function purgeSnapshots(
  root: string,
  relativePath: string,
  config: PurgeConfig = DEFAULT_PURGE,
): void {
  const snapshots = listSnapshots(root, relativePath);
  if (snapshots.length === 0) return;

  const now = Date.now();
  const maxAgeMs = config.maxAgeDays > 0 ? config.maxAgeDays * 24 * 60 * 60 * 1000 : 0;

  const toDelete: string[] = [];

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const tooMany = config.maxCount > 0 && i >= config.maxCount;
    const tooOld = maxAgeMs > 0 && now - snap.timestamp > maxAgeMs;

    if (tooMany || tooOld) {
      toDelete.push(snap.snapshotPath);
    }
  }

  for (const p of toDelete) {
    try {
      deleteSnapshot(root, p);
    } catch {
      // best-effort cleanup
    }
  }
}
