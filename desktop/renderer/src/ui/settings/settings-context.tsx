import React from "react";
import {
  checkCapabilities,
  fetchProviderModels,
  getConfig,
  patchConfig,
  pollOAuthToken,
  requestDeviceCode,
} from "../../services/api";
import { PROVIDERS } from "../setup/providers";
import {
  getConfigString,
  getProviderById,
  isProviderConfigured,
  type OAuthStep,
  type SettingsState,
} from "./settings-state";

const SettingsContext = React.createContext<SettingsState | null>(null);

export function SettingsStateProvider(props: {
  port: number;
  children: React.ReactNode;
}) {
  const { port, children } = props;
  const [capabilities, setCapabilities] = React.useState<SettingsState["capabilities"]>(null);
  const [configSnap, setConfigSnap] = React.useState<SettingsState["configSnap"]>(null);
  const [selectedProvider, setSelectedProvider] = React.useState<string | null>(null);
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [selectedModel, setSelectedModel] = React.useState("");
  const [configuredModel, setConfiguredModel] = React.useState("");
  const [isReloading, setIsReloading] = React.useState(false);
  const [isSavingProvider, setIsSavingProvider] = React.useState(false);
  const [isSavingModel, setIsSavingModel] = React.useState(false);
  const [isLoadingModels, setIsLoadingModels] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const [oauthStep, setOauthStep] = React.useState<OAuthStep>("idle");
  const [oauthUserCode, setOauthUserCode] = React.useState("");
  const [oauthVerificationUrl, setOauthVerificationUrl] = React.useState("");
  const [oauthError, setOauthError] = React.useState("");
  const oauthPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTransientState = React.useCallback(() => {
    if (oauthPollRef.current) {
      clearInterval(oauthPollRef.current);
      oauthPollRef.current = null;
    }
    setApiKey("");
    setSaveError("");
    setOauthStep("idle");
    setOauthUserCode("");
    setOauthVerificationUrl("");
    setOauthError("");
  }, []);

  React.useEffect(() => {
    return () => {
      if (oauthPollRef.current) {
        clearInterval(oauthPollRef.current);
      }
    };
  }, []);

  const reloadConfig = React.useCallback(async () => {
    setIsReloading(true);
    try {
      const [nextCapabilities, nextConfig] = await Promise.all([
        checkCapabilities(port).catch(() => null),
        getConfig(port),
      ]);
      setCapabilities(nextCapabilities);
      setConfigSnap(nextConfig);
      setSelectedProvider(nextConfig.activeProvider || PROVIDERS[0]?.id || null);
      setConfiguredModel(nextConfig.activeModel || "");
      setSelectedModel(nextConfig.activeModel || "");
      setBaseUrl(getConfigString(nextConfig.config, "base_url"));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to load settings.");
    } finally {
      setIsReloading(false);
    }
  }, [port]);

  React.useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  const loadModels = React.useCallback(
    async (providerId?: string) => {
      const activeProvider = providerId || selectedProvider;
      if (!activeProvider) {
        setAvailableModels([]);
        return;
      }
      setIsLoadingModels(true);
      try {
        const models = await fetchProviderModels(port, activeProvider);
        const ids = models.map((model) => model.id).filter(Boolean).slice(0, 50);
        setAvailableModels(ids);
        setSelectedModel((current) => current || ids[0] || "");
      } catch {
        setAvailableModels([]);
      } finally {
        setIsLoadingModels(false);
      }
    },
    [port, selectedProvider],
  );

  const saveProviderConfig = React.useCallback(async () => {
    const provider = getProviderById(selectedProvider);
    if (!provider) {
      return false;
    }
    setIsSavingProvider(true);
    setSaveError("");
    try {
      const body: { config: Record<string, unknown>; env?: Record<string, string> } = {
        config: { provider: provider.id },
      };
      if ((provider.id === "ollama" || provider.authType === "custom") && baseUrl.trim()) {
        body.config.base_url = baseUrl.trim();
      }
      if (provider.envKey && apiKey.trim()) {
        body.env = { [provider.envKey]: apiKey.trim() };
      }
      await patchConfig(port, body);
      await reloadConfig();
      document.dispatchEvent(new Event("hermes-config-changed"));
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save provider settings.");
      return false;
    } finally {
      setIsSavingProvider(false);
    }
  }, [apiKey, baseUrl, port, reloadConfig, selectedProvider]);

  const saveModelSelection = React.useCallback(async (modelOverride?: string, providerOverride?: string) => {
    const providerId = providerOverride || selectedProvider;
    if (!providerId) {
      return false;
    }
    const fallbackModel =
      providerId === configSnap?.activeProvider ? configuredModel : "";
    const model = modelOverride || selectedModel || fallbackModel;
    if (!model) {
      return false;
    }
    setIsSavingModel(true);
    setSaveError("");
    try {
      await patchConfig(port, {
        config: {
          provider: providerId,
          model,
        },
      });
      await reloadConfig();
      document.dispatchEvent(new Event("hermes-config-changed"));
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save model settings.");
      return false;
    } finally {
      setIsSavingModel(false);
    }
  }, [configSnap?.activeProvider, configuredModel, port, reloadConfig, selectedModel, selectedProvider]);

  const startOAuth = React.useCallback(async () => {
    const provider = getProviderById(selectedProvider);
    if (!provider?.oauthProvider) {
      return;
    }
    if (oauthPollRef.current) {
      clearInterval(oauthPollRef.current);
      oauthPollRef.current = null;
    }
    setOauthStep("loading");
    setOauthError("");
    try {
      const data = await requestDeviceCode(port, provider.oauthProvider);
      if (!data.ok || !data.device_code) {
        setOauthError(data.error || "Failed to start OAuth.");
        setOauthStep("error");
        return;
      }
      setOauthUserCode(data.user_code || "");
      setOauthVerificationUrl(data.verification_uri_complete || "");
      setOauthStep("waiting");
      const intervalMs = Math.max((data.interval || 5) * 1000, 3000);
      oauthPollRef.current = setInterval(async () => {
        try {
          const result = await pollOAuthToken(port, provider.oauthProvider!, data.device_code!, {
            client_id: data.client_id || "",
            portal_base_url: data.portal_base_url || "",
            user_code: data.user_code || "",
          });
          if (result.status === "success") {
            if (oauthPollRef.current) {
              clearInterval(oauthPollRef.current);
              oauthPollRef.current = null;
            }
            setOauthStep("success");
            await reloadConfig();
          }
          if (result.status === "error") {
            if (oauthPollRef.current) {
              clearInterval(oauthPollRef.current);
              oauthPollRef.current = null;
            }
            setOauthError(result.message || "Authentication failed.");
            setOauthStep("error");
          }
        } catch {
          // Keep polling on transient network failures.
        }
      }, intervalMs);
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : "Failed to start OAuth.");
      setOauthStep("error");
    }
  }, [port, reloadConfig, selectedProvider]);

  const providerConfigured = React.useMemo(
    () =>
      isProviderConfigured({
        providerId: selectedProvider,
        configSnap,
        oauthStep,
        baseUrl,
      }),
    [baseUrl, configSnap, oauthStep, selectedProvider],
  );

  const value = React.useMemo<SettingsState>(
    () => ({
      port,
      capabilities,
      configSnap,
      selectedProvider,
      setSelectedProvider,
      apiKey,
      setApiKey,
      baseUrl,
      setBaseUrl,
      availableModels,
      selectedModel,
      setSelectedModel,
      configuredModel,
      isReloading,
      isSavingProvider,
      isSavingModel,
      isLoadingModels,
      saveError,
      setSaveError,
      oauthStep,
      oauthUserCode,
      oauthVerificationUrl,
      oauthError,
      canEditConfig: capabilities?.capabilities?.config ?? false,
      providerConfigured,
      reloadConfig,
      loadModels,
      saveProviderConfig,
      saveModelSelection,
      startOAuth,
      resetTransientState,
    }),
    [
      apiKey,
      availableModels,
      baseUrl,
      capabilities,
      configSnap,
      configuredModel,
      isLoadingModels,
      isReloading,
      isSavingModel,
      isSavingProvider,
      loadModels,
      oauthError,
      oauthStep,
      oauthUserCode,
      oauthVerificationUrl,
      port,
      providerConfigured,
      reloadConfig,
      resetTransientState,
      saveError,
      saveModelSelection,
      saveProviderConfig,
      selectedModel,
      selectedProvider,
      startOAuth,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettingsState(): SettingsState {
  const value = React.useContext(SettingsContext);
  if (!value) {
    throw new Error("Settings state is unavailable outside of SettingsStateProvider.");
  }
  return value;
}
