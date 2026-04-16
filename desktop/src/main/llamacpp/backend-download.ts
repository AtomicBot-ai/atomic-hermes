import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

import { downloadFile } from "./download";

const GITHUB_REPO = "AtomicBot-ai/atomic-llama-cpp-turboquant";
const VERSION_FILE = "backend-version.json";

export type BackendVersionInfo = {
  tag: string;
  downloadedAt: string;
};

function resolveAssetName(arch: string): string {
  if (arch === "arm64") return "llama-turboquant-macos-arm64.zip";
  if (arch === "x64") return "llama-turboquant-macos-x64.zip";
  throw new Error(`Unsupported architecture for llamacpp backend: ${arch}`);
}

function versionFilePath(dataDir: string): string {
  return path.join(dataDir, "backend", VERSION_FILE);
}

export function readBackendVersion(dataDir: string): BackendVersionInfo | null {
  const vPath = versionFilePath(dataDir);
  try {
    const raw = fs.readFileSync(vPath, "utf-8");
    return JSON.parse(raw) as BackendVersionInfo;
  } catch {
    return null;
  }
}

function writeBackendVersion(dataDir: string, info: BackendVersionInfo): void {
  const vPath = versionFilePath(dataDir);
  fs.mkdirSync(path.dirname(vPath), { recursive: true });
  fs.writeFileSync(vPath, JSON.stringify(info, null, 2));
}

export function resolveServerBinPath(dataDir: string): string {
  return path.join(dataDir, "backend", "llama-server");
}

export function isBackendDownloaded(dataDir: string): boolean {
  const binPath = resolveServerBinPath(dataDir);
  return fs.existsSync(binPath);
}

async function fetchLatestRelease(): Promise<{
  tag: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const headers: Record<string, string> = {
    "User-Agent": "hermes-desktop/llamacpp-backend",
    Accept: "application/vnd.github+json",
  };
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch latest release: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    tag_name: string;
    assets: Array<{ name: string; browser_download_url: string }>;
  };
  return {
    tag: data.tag_name,
    assets: data.assets ?? [],
  };
}

export async function checkForBackendUpdate(
  dataDir: string
): Promise<{ updateAvailable: boolean; latestTag: string; currentTag: string | null }> {
  const current = readBackendVersion(dataDir);
  const release = await fetchLatestRelease();
  return {
    updateAvailable: current?.tag !== release.tag,
    latestTag: release.tag,
    currentTag: current?.tag ?? null,
  };
}

export async function downloadBackend(
  dataDir: string,
  opts?: {
    onProgress?: (percent: number, transferred: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<{ ok: true; tag: string }> {
  const release = await fetchLatestRelease();
  const assetName = resolveAssetName(process.arch);
  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    const known = release.assets.map((a) => a.name).join(", ");
    throw new Error(`Backend asset not found: ${assetName}. Available: ${known || "<none>"}`);
  }

  const backendDir = path.join(dataDir, "backend");
  fs.mkdirSync(backendDir, { recursive: true });
  const archivePath = path.join(backendDir, assetName);

  await downloadFile(asset.browser_download_url, archivePath, {
    onProgress: opts?.onProgress,
    userAgent: "hermes-desktop/llamacpp-backend-download",
    signal: opts?.signal,
  });

  const extractDir = path.join(backendDir, "_extract");
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    execSync(`unzip -o "${archivePath}" -d "${extractDir}"`, {
      timeout: 60_000,
    });
  } catch (err) {
    throw new Error(`Failed to extract backend archive: ${String(err)}`);
  }

  const serverBin = findFile(extractDir, "llama-server");
  if (!serverBin) {
    throw new Error("llama-server binary not found in extracted archive");
  }

  const binSourceDir = path.dirname(serverBin);
  for (const entry of fs.readdirSync(binSourceDir, { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    const src = path.join(binSourceDir, entry.name);
    const dest = path.join(backendDir, entry.name);
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
  }

  try {
    execSync(`xattr -cr "${backendDir}"`, { timeout: 10_000 });
  } catch {
    // xattr may fail on non-macOS or if attributes are already absent
  }

  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.rmSync(archivePath, { force: true });

  writeBackendVersion(dataDir, {
    tag: release.tag,
    downloadedAt: new Date().toISOString(),
  });

  return { ok: true, tag: release.tag };
}

function findFile(dir: string, name: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, name);
      if (found) return found;
    } else if (entry.name === name) {
      return fullPath;
    }
  }
  return null;
}
