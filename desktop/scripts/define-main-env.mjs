#!/usr/bin/env node
/**
 * Inlines build-time environment variables into the compiled main-process JS.
 * Must run after `tsc` so that dist/main/analytics/posthog-main.js exists.
 *
 * Uses esbuild --define (no bundling) to replace process.env.* literals.
 * Also reads from a local .env file when env vars are not already set in the
 * shell — this covers both local dev builds and CI environments alike.
 */
import { build } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const posthogKey = process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_API_KEY || "";

const define = {
  "process.env.POSTHOG_API_KEY": JSON.stringify(posthogKey),
};

const targets = ["dist/main/analytics/posthog-main.js"];

for (const target of targets) {
  const filePath = join(root, target);
  if (!existsSync(filePath)) {
    console.warn(`[define-main-env] skipping ${target} (not found)`);
    continue;
  }
  await build({
    entryPoints: [filePath],
    outfile: filePath,
    platform: "node",
    format: "cjs",
    allowOverwrite: true,
    define,
  });
}

console.log("[define-main-env] main-process env vars inlined.");
