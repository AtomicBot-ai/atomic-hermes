import { createContext, useContext } from "react";
import type { CapabilitiesResponse, DeviceCodeResponse } from "../../services/api";

export type OAuthStep = "idle" | "loading" | "waiting" | "success" | "error";

export type SetupState = {
  port: number;
  capabilities: CapabilitiesResponse | null;
  setCapabilities: (caps: CapabilitiesResponse | null) => void;

  selectedProvider: string | null;
  setSelectedProvider: (id: string | null) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  baseUrl: string;
  setBaseUrl: (url: string) => void;

  saving: boolean;
  saveError: string;
  setSaveError: (err: string) => void;

  availableModels: string[];
  setAvailableModels: (models: string[]) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  configuredModel: string;
  setConfiguredModel: (model: string) => void;

  oauthStep: OAuthStep;
  setOauthStep: (step: OAuthStep) => void;
  oauthUserCode: string;
  setOauthUserCode: (code: string) => void;
  oauthVerificationUrl: string;
  setOauthVerificationUrl: (url: string) => void;
  oauthError: string;
  setOauthError: (err: string) => void;
  deviceCodeData: DeviceCodeResponse | null;
  setDeviceCodeData: (data: DeviceCodeResponse | null) => void;
  oauthPollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;

  checkCapabilities: () => Promise<void>;
  loadCurrentConfig: () => Promise<void>;
  loadModels: (provider?: string) => Promise<void>;
  saveProviderConfig: () => Promise<boolean>;
  saveModelSelection: () => Promise<boolean>;
  startOAuth: () => Promise<void>;

  complete: () => void;
  skip: () => void;
};

export const SetupContext = createContext<SetupState | null>(null);

export function useSetup(): SetupState {
  const ctx = useContext(SetupContext);
  if (!ctx) {
    throw new Error("useSetup must be used within SetupContext.Provider");
  }
  return ctx;
}
