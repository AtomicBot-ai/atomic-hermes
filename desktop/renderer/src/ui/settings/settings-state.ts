import React from "react";
import type { CapabilitiesResponse, ConfigResponse } from "../../services/api";
import { PROVIDERS, type ProviderDef } from "../setup/providers";

export type OAuthStep = "idle" | "loading" | "waiting" | "success" | "error";

export type SettingsState = {
  port: number;
  capabilities: CapabilitiesResponse | null;
  configSnap: ConfigResponse | null;
  selectedProvider: string | null;
  setSelectedProvider: React.Dispatch<React.SetStateAction<string | null>>;
  apiKey: string;
  setApiKey: React.Dispatch<React.SetStateAction<string>>;
  baseUrl: string;
  setBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  availableModels: string[];
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  configuredModel: string;
  isReloading: boolean;
  isSavingProvider: boolean;
  isSavingModel: boolean;
  isLoadingModels: boolean;
  saveError: string;
  setSaveError: React.Dispatch<React.SetStateAction<string>>;
  oauthStep: OAuthStep;
  oauthUserCode: string;
  oauthVerificationUrl: string;
  oauthError: string;
  canEditConfig: boolean;
  providerConfigured: boolean;
  reloadConfig: () => Promise<void>;
  loadModels: (provider?: string) => Promise<void>;
  saveProviderConfig: () => Promise<boolean>;
  saveModelSelection: (model?: string, providerId?: string) => Promise<boolean>;
  startOAuth: () => Promise<void>;
  resetTransientState: () => void;
};

export function getProviderById(providerId: string | null): ProviderDef | undefined {
  return PROVIDERS.find((provider) => provider.id === providerId);
}

export function getConfigString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

export function isProviderConfigured(params: {
  providerId: string | null;
  configSnap: ConfigResponse | null;
  oauthStep: OAuthStep;
  baseUrl: string;
}): boolean {
  const provider = getProviderById(params.providerId);
  if (!provider || !params.configSnap) {
    return false;
  }
  if (provider.envKey) {
    return params.configSnap.providers.some(
      (entry) => entry.envVar === provider.envKey && entry.configured,
    );
  }
  if (provider.authType === "oauth") {
    return params.configSnap.activeProvider === provider.id || params.oauthStep === "success";
  }
  if (provider.id === "custom") {
    return Boolean(params.baseUrl.trim()) || params.configSnap.activeProvider === provider.id;
  }
  return params.configSnap.activeProvider === provider.id;
}
