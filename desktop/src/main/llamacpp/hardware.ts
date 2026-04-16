import * as os from "node:os";

import type { LlamacppModelDef } from "./models";

export type SystemInfo = {
  totalRamGb: number;
  arch: string;
  platform: string;
  isAppleSilicon: boolean;
};

export type ModelCompatibility = "recommended" | "possible" | "not-recommended";

export function getSystemInfo(): SystemInfo {
  const totalRamGb = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
  const arch = process.arch;
  const platform = process.platform;
  const isAppleSilicon = platform === "darwin" && arch === "arm64";
  return { totalRamGb, arch, platform, isAppleSilicon };
}

export function getModelCompatibility(
  model: LlamacppModelDef,
  sysInfo: SystemInfo
): ModelCompatibility {
  if (sysInfo.totalRamGb >= model.recommendedRamGb) return "recommended";
  if (sysInfo.totalRamGb >= model.minRamGb) return "possible";
  return "not-recommended";
}

const OS_RESERVE_GB = 4;
const MIN_CONTEXT = 2048;

/**
 * Compute a safe runtime context length based on available RAM and model size.
 *
 * With turbo3 KV cache, overhead per 8K context is roughly:
 *   ~0.25 GB for small models (<=3 GB file)
 *   ~0.15 * fileSizeGb  GB for larger models
 *
 * Budget = totalRam - modelFileSize - OS reserve, then divide by per-8K cost.
 */
export function computeContextLength(totalRamGb: number, model: LlamacppModelDef): number {
  const availableGb = totalRamGb - model.fileSizeGb - OS_RESERVE_GB;
  if (availableGb <= 0) return MIN_CONTEXT;

  const kvPer8K = Math.max(0.25, model.fileSizeGb * 0.15);
  const blocks = Math.floor(availableGb / kvPer8K);
  const computed = blocks * 8192;

  const MAX_CONTEXT = 200_000;
  const clamped = Math.max(MIN_CONTEXT, Math.min(computed, model.maxContextLength, MAX_CONTEXT));
  return Math.max(MIN_CONTEXT, Math.floor(clamped / 5000) * 5000);
}
