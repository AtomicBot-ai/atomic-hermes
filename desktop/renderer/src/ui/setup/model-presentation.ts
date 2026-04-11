export type ModelTier = "ultra" | "pro" | "fast";

export const TIER_INFO: Record<
  ModelTier,
  { label: string; description: string }
> = {
  ultra: {
    label: "Ultra",
    description:
      "Most capable. Best for complex reasoning, analysis, and creative tasks.",
  },
  pro: {
    label: "Pro",
    description:
      "Balanced. Great for coding, writing, and everyday tasks.",
  },
  fast: {
    label: "Fast",
    description:
      "Quickest responses. Ideal for simple tasks and high-volume use.",
  },
};

const TIER_PATTERNS: Array<{ pattern: RegExp; tier: ModelTier }> = [
  // Claude
  { pattern: /claude.*opus.*4/i, tier: "ultra" },
  { pattern: /claude.*sonnet.*4/i, tier: "pro" },
  { pattern: /claude.*haiku/i, tier: "fast" },
  // GPT
  { pattern: /gpt-?5\.2/i, tier: "ultra" },
  { pattern: /gpt-?5\.1/i, tier: "pro" },
  { pattern: /gpt-?5-?mini/i, tier: "fast" },
  { pattern: /gpt-?4\.1/i, tier: "pro" },
  { pattern: /gpt-?4\.1-?mini/i, tier: "fast" },
  // Gemini
  { pattern: /gemini.*2\.5.*pro/i, tier: "ultra" },
  { pattern: /gemini.*2\.5.*flash/i, tier: "pro" },
  { pattern: /gemini.*3.*flash/i, tier: "fast" },
  // Grok
  { pattern: /grok.*4.*fast/i, tier: "fast" },
  { pattern: /grok.*4/i, tier: "pro" },
];

export function getModelTier(modelId: string): ModelTier | null {
  for (const { pattern, tier } of TIER_PATTERNS) {
    if (pattern.test(modelId)) return tier;
  }
  return null;
}
