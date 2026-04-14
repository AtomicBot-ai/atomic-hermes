import React from "react";
import { RichSelect, type RichOption } from "../setup/RichSelect";
import { getModelTier, TIER_INFO } from "../setup/model-presentation";
import { PROVIDERS, resolveProviderIconUrl } from "../setup/providers";
import { useSettingsState } from "./settings-context";
import { AiModelsInlineProvider } from "./AiModelsInlineProvider";
import { AiModelsStatusBar } from "./AiModelsStatusBar";
import s from "./AiModelsTab.module.css";

function getProviderBadge(provider: (typeof PROVIDERS)[number]):
  | { text: string; variant: string }
  | undefined {
  if (provider.recommended) {
    return { text: "Recommended", variant: "recommended" };
  }
  if (provider.popular) {
    return { text: "Popular", variant: "popular" };
  }
  if (provider.localModels) {
    return { text: "Local", variant: "local" };
  }
  return undefined;
}

export function AiModelsTab() {
  const {
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
    oauthStep,
    oauthUserCode,
    oauthVerificationUrl,
    oauthError,
    canEditConfig,
    providerConfigured,
    reloadConfig,
    loadModels,
    saveProviderConfig,
    saveModelSelection,
    startOAuth,
    resetTransientState,
  } = useSettingsState();
  const previousProviderRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!selectedProvider && configSnap) {
      setSelectedProvider(PROVIDERS[0]?.id || null);
    }
  }, [selectedProvider, setSelectedProvider, configSnap]);

  React.useEffect(() => {
    if (!selectedProvider) {
      return;
    }
    const isInitialSet = previousProviderRef.current === null;
    if (!isInitialSet && previousProviderRef.current !== selectedProvider) {
      setSelectedModel("");
    }
    previousProviderRef.current = selectedProvider;
    void loadModels(selectedProvider);
  }, [loadModels, selectedProvider, setSelectedModel]);

  const provider = PROVIDERS.find((item) => item.id === selectedProvider) ?? null;
  const effectiveConfiguredModel =
    selectedProvider && selectedProvider === configSnap?.activeProvider ? configuredModel : "";
  const selectedModelValue = selectedModel || effectiveConfiguredModel || null;

  const providerOptions = React.useMemo<RichOption<string>[]>(
    () =>
      PROVIDERS.map((item) => ({
        value: item.id,
        label: item.name,
        icon: resolveProviderIconUrl(item.id),
        emoji: item.emoji,
        description: item.desc,
        badge: getProviderBadge(item),
      })),
    [],
  );

  const modelOptions = React.useMemo<RichOption<string>[]>(() => {
    const providerIcon = selectedProvider ? resolveProviderIconUrl(selectedProvider) : undefined;
    return availableModels
      .slice()
      .sort((left, right) => left.localeCompare(right))
      .map((modelId) => {
        const tier = getModelTier(modelId);
        return {
          value: modelId,
          label: modelId,
          icon: providerIcon,
          badge: tier ? { text: TIER_INFO[tier].label, variant: tier } : undefined,
          description: tier ? TIER_INFO[tier].description : undefined,
        };
      });
  }, [availableModels, selectedProvider]);

  const handleProviderChange = React.useCallback(
    (providerId: string) => {
      setSelectedProvider(providerId);
      setSelectedModel("");
      resetTransientState();
      if (providerId !== "ollama" && providerId !== "custom") {
        setBaseUrl("");
      }
    },
    [resetTransientState, setBaseUrl, setSelectedModel, setSelectedProvider],
  );

  const handleModelChange = React.useCallback(
    (modelId: string) => {
      if (!selectedProvider) {
        return;
      }
      setSelectedModel(modelId);
      void saveModelSelection(modelId, selectedProvider);
    },
    [saveModelSelection, selectedProvider, setSelectedModel],
  );

  const handleProviderSave = React.useCallback(async () => {
    if (!provider) {
      return false;
    }
    if (provider.authType === "oauth" && oauthStep !== "success") {
      if (!canEditConfig) {
        return false;
      }
      await startOAuth();
      return false;
    }
    const saved = await saveProviderConfig();
    if (saved && selectedProvider) {
      await loadModels(selectedProvider);
    }
    return saved;
  }, [
    canEditConfig,
    loadModels,
    oauthStep,
    provider,
    saveProviderConfig,
    selectedProvider,
    startOAuth,
  ]);

  React.useEffect(() => {
    if (!selectedProvider || isLoadingModels || isSavingModel || modelOptions.length === 0) {
      return;
    }
    if (selectedModelValue && modelOptions.some((option) => option.value === selectedModelValue)) {
      return;
    }
    const fallbackModel = modelOptions[0]?.value;
    if (!fallbackModel) {
      return;
    }
    setSelectedModel(fallbackModel);
    void saveModelSelection(fallbackModel, selectedProvider);
  }, [
    isLoadingModels,
    isSavingModel,
    modelOptions,
    saveModelSelection,
    selectedModelValue,
    selectedProvider,
    setSelectedModel,
  ]);

  const currentModelName = selectedModelValue || null;

  return (
    <div className={s.root}>
      <div className={s.title}>AI Models</div>

      <AiModelsStatusBar modeLabel="API keys" modelName={currentModelName} />

      <div className={s.dropdownRow}>
        <div className={s.dropdownGroup}>
          <div className={s.dropdownLabel}>Provider</div>
          <RichSelect
            value={selectedProvider}
            onChange={handleProviderChange}
            options={providerOptions}
            placeholder="Select provider..."
            disabled={isSavingProvider || isReloading}
          />
        </div>

        <div className={s.dropdownGroup}>
          <div className={s.dropdownLabel}>Model</div>
          <RichSelect
            value={selectedModelValue}
            onChange={handleModelChange}
            options={modelOptions}
            placeholder={
              !selectedProvider
                ? "Select provider first"
                : modelOptions.length === 0
                  ? "Enter API key to choose a model"
                  : "Select model..."
            }
            disabled={!selectedProvider || isLoadingModels || isSavingModel || modelOptions.length === 0}
            disabledStyles={!selectedProvider || modelOptions.length === 0}
            onlySelectedIcon
          />
        </div>
      </div>

      {selectedProvider && modelOptions.length === 0 && !isLoadingModels ? (
        <div className={s.noModelsHint}>
          {!providerConfigured
            ? "Add an API key below to load models for this provider."
            : "No models loaded. Try reloading settings or reconfiguring this provider."}
        </div>
      ) : null}

      {provider ? (
        <AiModelsInlineProvider
          provider={provider}
          providerConfigured={providerConfigured}
          isReloading={isReloading}
          isSavingProvider={isSavingProvider}
          saveError={saveError}
          apiKey={apiKey}
          setApiKey={setApiKey}
          baseUrl={baseUrl}
          setBaseUrl={setBaseUrl}
          oauthStep={oauthStep}
          oauthUserCode={oauthUserCode}
          oauthVerificationUrl={oauthVerificationUrl}
          oauthError={oauthError}
          canEditConfig={canEditConfig}
          onReload={reloadConfig}
          onSave={handleProviderSave}
          onOAuthStart={startOAuth}
        />
      ) : null}
    </div>
  );
}
