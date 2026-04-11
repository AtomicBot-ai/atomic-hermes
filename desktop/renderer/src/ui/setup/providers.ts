export type ProviderDef = {
  id: string;
  name: string;
  desc: string;
  authType: "oauth" | "api_key" | "none" | "custom";
  envKey?: string;
  oauthProvider?: "nous" | "openai-codex";
  svgIcon?: string;
  emoji?: string;
  placeholder?: string;
  helpText?: string;
  helpUrl?: string;
  recommended?: boolean;
  popular?: boolean;
  localModels?: boolean;
  privacyFirst?: boolean;
};

const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "anthropic.svg",
  openai: "openai.svg",
  "openai-codex": "openai-codex.svg",
  openrouter: "openrouter.svg",
  ollama: "ollama.svg",
  gemini: "gemini.svg",
  xai: "xai.svg",
  "kimi-coding": "kimi-coding.svg",
  minimax: "minimax.svg",
  moonshot: "moonshot.svg",
  nvidia: "nvidia.svg",
  venice: "venice.svg",
  zai: "zai.svg",
};

export function resolveProviderIconUrl(providerId: string): string | undefined {
  const filename = PROVIDER_ICONS[providerId];
  if (!filename) return undefined;
  return new URL(
    `../../../../assets/ai-providers/${filename}`,
    import.meta.url,
  ).toString();
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "nous",
    name: "Nous Portal",
    desc: "Free via OAuth",
    authType: "oauth",
    oauthProvider: "nous",
    emoji: "🔮",
    helpText: "Connect your Nous account to start using free hosted models.",
    helpUrl: "https://portal.nousresearch.com/",
    recommended: true,
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    desc: "Free via ChatGPT Pro",
    authType: "oauth",
    oauthProvider: "openai-codex",
    svgIcon: "openai-codex",
    helpText: "Connect your ChatGPT account to use OpenAI Codex at no extra cost.",
    helpUrl: "https://openai.com/codex/",
    popular: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    desc: "API key required",
    authType: "api_key",
    envKey: "ANTHROPIC_API_KEY",
    svgIcon: "anthropic",
    placeholder: "sk-ant-...",
    helpText: "Get your API key from the Anthropic Console.",
    helpUrl: "https://console.anthropic.com/settings/keys",
    recommended: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    desc: "API key required",
    authType: "api_key",
    envKey: "OPENROUTER_API_KEY",
    svgIcon: "openrouter",
    placeholder: "sk-or-...",
    helpText: "Get your API key from OpenRouter.",
    helpUrl: "https://openrouter.ai/keys",
    popular: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    desc: "API key required",
    authType: "api_key",
    envKey: "OPENAI_API_KEY",
    svgIcon: "openai",
    placeholder: "sk-...",
    helpText: "Get your API key from the OpenAI Platform.",
    helpUrl: "https://platform.openai.com/api-keys",
    popular: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    desc: "Local models, no key needed",
    authType: "none",
    svgIcon: "ollama",
    placeholder: "ollama-api-key...",
    helpText: "Run models locally or point Hermes to your Ollama server.",
    helpUrl: "https://ollama.com/",
    localModels: true,
  },
  {
    id: "custom",
    name: "Custom (OpenAI-compat)",
    desc: "Any OpenAI-compatible endpoint",
    authType: "custom",
    emoji: "🔧",
    placeholder: "sk-...",
    helpText: "Configure any OpenAI-compatible API using your base URL and API key.",
  },
];
