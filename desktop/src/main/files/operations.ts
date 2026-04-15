import * as fs from "fs";
import * as path from "path";

export type DirEntry = {
  name: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
};

const MAX_READ_SIZE = 5 * 1024 * 1024; // 5 MB

export function safePath(root: string, relative: string): string {
  const resolved = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root) + path.sep;
  const normalizedResolved = path.resolve(resolved);
  if (normalizedResolved !== path.resolve(root) && !normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error("Path traversal denied");
  }
  return normalizedResolved;
}

export function listDirectory(root: string, relativePath: string): DirEntry[] {
  const target = safePath(root, relativePath);
  const entries = fs.readdirSync(target, { withFileTypes: true });
  const result: DirEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    try {
      const fullPath = path.join(target, entry.name);
      const stat = fs.statSync(fullPath);
      result.push({
        name: entry.name,
        type: entry.isDirectory() ? "dir" : "file",
        size: stat.size,
        mtime: stat.mtimeMs,
      });
    } catch {
      // skip entries we can't stat (broken symlinks, permission errors)
    }
  }

  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

export function readFileContent(
  root: string,
  relativePath: string,
): { content: string; size: number } {
  const target = safePath(root, relativePath);
  const stat = fs.statSync(target);
  if (stat.size > MAX_READ_SIZE) {
    throw new Error(`File too large (${Math.round(stat.size / 1024 / 1024)}MB). Max ${MAX_READ_SIZE / 1024 / 1024}MB.`);
  }
  const content = fs.readFileSync(target, "utf-8");
  return { content, size: stat.size };
}

export function writeFileContent(
  root: string,
  relativePath: string,
  content: string,
): void {
  const target = safePath(root, relativePath);
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = target + ".tmp." + Date.now();
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, target);
}

export function createDirectory(root: string, relativePath: string): void {
  const target = safePath(root, relativePath);
  fs.mkdirSync(target, { recursive: true });
}

export function renameEntry(
  root: string,
  oldRelative: string,
  newRelative: string,
): void {
  const oldTarget = safePath(root, oldRelative);
  const newTarget = safePath(root, newRelative);
  fs.renameSync(oldTarget, newTarget);
}

export function deleteEntry(root: string, relativePath: string): void {
  const target = safePath(root, relativePath);
  fs.rmSync(target, { recursive: true, force: true });
}
