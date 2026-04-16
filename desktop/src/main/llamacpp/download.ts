import * as fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Download a file from `url` to `destPath` with optional progress tracking.
 * Writes to a `.tmp` file first, then renames atomically on success.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  opts?: {
    onProgress?: (percent: number, transferred: number, total: number) => void;
    userAgent?: string;
    signal?: AbortSignal;
  }
): Promise<void> {
  const headers: Record<string, string> = {
    "User-Agent": opts?.userAgent ?? "hermes-desktop",
  };
  const isGitHub = url.includes("github.com") || url.includes("githubusercontent.com");
  if (isGitHub) {
    const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  console.log(`[downloadFile] fetching: ${url}`);
  const res = await fetch(url, { headers, redirect: "follow", signal: opts?.signal });
  console.log(
    `[downloadFile] response: ${res.status} ${res.statusText}, content-length=${res.headers.get("content-length")}`
  );
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }

  const totalRaw = res.headers.get("content-length");
  const total = totalRaw ? parseInt(totalRaw, 10) : 0;
  let transferred = 0;
  let lastReportedPercent = -1;

  const reader = res.body.getReader();
  const trackingStream = new ReadableStream({
    async pull(controller) {
      if (opts?.signal?.aborted) {
        await reader.cancel();
        controller.close();
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      transferred += value.byteLength;
      const percent = total > 0 ? Math.round((transferred / total) * 100) : 0;
      if (percent !== lastReportedPercent) {
        lastReportedPercent = percent;
        opts?.onProgress?.(percent, transferred, total);
      }
      controller.enqueue(value);
    },
  });

  const nodeReadable = Readable.fromWeb(trackingStream as import("node:stream/web").ReadableStream);
  const tmpPath = `${destPath}.tmp`;
  try {
    const writeStream = fs.createWriteStream(tmpPath);
    await pipeline(nodeReadable, writeStream);
    fs.renameSync(tmpPath, destPath);
  } finally {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      /* ignore */
    }
  }
}
