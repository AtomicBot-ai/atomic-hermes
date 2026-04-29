import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { switchMode } from "@store/slices/auth/mode-switch";
import { MODE_LABELS, type HermesSetupMode } from "@store/slices/mode-persistence";
import { fetchLlamacppServerStatus, stopLlamacppServer } from "@store/slices/llamacppSlice";
import { RichSelect, type RichOption } from "../setup/RichSelect";
import { getModelTier, TIER_INFO } from "../setup/model-presentation";
import { PROVIDERS, resolveProviderIconUrl } from "../setup/providers";
import { isProfileUsingLlamacppServer } from "./llamacpp-profile-config";
import { useSettingsState } from "./settings-context";
import { AiModelsInlineProvider } from "./AiModelsInlineProvider";
import {
  AiModelsStatusBar,
  LLAMACPP_PRIMARY_PREFIX,
  formatModelIdForStatusBar,
  resolveLlamacppServerUiKey,
} from "./AiModelsStatusBar";
import { LocalModelsTab } from "./local-models/LocalModelsTab";
import { AtomicAccountTab } from "./atomic/AtomicAccountTab";
import { AtomicSignInPrompt } from "../shared/atomic/AtomicSignInPrompt";
import s from "./AiModelsTab.module.css";

function getProviderBadge(provider: (typeof PROVIDERS)[number]):
  | { text: string; variant: string }
  | undefined {
  if (provider.recommended) return { text: "Recommended", variant: "recommended" };
  if (provider.popular) return { text: "Popular", variant: "popular" };
  if (provider.localModels) return { text: "Local", variant: "local" };
  return undefined;
}

function ConnectionToggle(props: {
  activeMode: HermesSetupMode | null;
  disabled: boolean;
  onSelect: (mode: HermesSetupMode) => void;
}) {
  const active = props.activeMode;
  return (
    <div className={s.connectionSection}>
      <div className={s.connectionSelector} role="radiogroup" aria-label="Connection mode">
        <button
          type="button"
          className={`${s.connectionOption}${active === "atomic-payg" ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => void props.onSelect("atomic-payg")}
          disabled={props.disabled}
        >
          {MODE_LABELS["atomic-payg"]}
        </button>
        <button
          type="button"
          className={`${s.connectionOption}${active === "self-managed" ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => void props.onSelect("self-managed")}
          disabled={props.disabled}
        >
          {MODE_LABELS["self-managed"]}
        </button>
        <button
          type="button"
          className={`${s.connectionOption}${active === "local-model" ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => void props.onSelect("local-model")}
          disabled={props.disabled}
        >
          {MODE_LABELS["local-model"]}
        </button>
      </div>
    </div>
  );
}

export function AiModelsTab() {
  const dispatch = useAppDispatch();
  const authMode = useAppSelector((st) => st.config.mode);
  const jwt = useAppSelector((st) => st.atomicAuth.jwt);
  const llamacpp = useAppSelector((st) => st.llamacpp);

  const [tabMode, setTabMode] = React.useState<HermesSetupMode>(authMode);
  const [modeSwitchBusy, setModeSwitchBusy] = React.useState(false);

  React.useEffect(() => {
    setTabMode(authMode);
  }, [authMode]);

  const {
    port,
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
    void dispatch(fetchLlamacppServerStatus());
  }, [dispatch]);

  React.useEffect(() => {
    if (!selectedProvider && configSnap) {
      setSelectedProvider(PROVIDERS[0]?.id || null);
    }
  }, [selectedProvider, setSelectedProvider, configSnap]);

  React.useEffect(() => {
    if (!selectedProvider) return;
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
    return availableModels
      .slice()
      .sort((left, right) => left.localeCompare(right))
      .map((modelId) => {
        const tier = getModelTier(modelId);
        return {
          value: modelId,
          label: modelId,
          badge: tier ? { text: TIER_INFO[tier].label, variant: tier } : undefined,
          description: tier ? TIER_INFO[tier].description : undefined,
        };
      });
  }, [availableModels]);

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
      if (!selectedProvider) return;
      setSelectedModel(modelId);
      void saveModelSelection(modelId, selectedProvider);
    },
    [saveModelSelection, selectedProvider, setSelectedModel],
  );

  const handleProviderSave = React.useCallback(async () => {
    if (!provider) return false;
    if (provider.authType === "oauth" && oauthStep !== "success") {
      if (!canEditConfig) return false;
      await startOAuth();
      return false;
    }
    const saved = await saveProviderConfig();
    if (saved && selectedProvider) {
      await loadModels(selectedProvider);
    }
    return saved;
  }, [canEditConfig, loadModels, oauthStep, provider, saveProviderConfig, selectedProvider, startOAuth]);

  React.useEffect(() => {
    if (tabMode === "atomic-payg") return;
    if (!selectedProvider || isLoadingModels || isSavingModel || modelOptions.length === 0) return;
    if (selectedModelValue?.startsWith(LLAMACPP_PRIMARY_PREFIX)) return;
    if (selectedModelValue && modelOptions.some((option) => option.value === selectedModelValue)) return;
    const fallbackModel = modelOptions[0]?.value;
    if (!fallbackModel) return;
    setSelectedModel(fallbackModel);
    void saveModelSelection(fallbackModel, selectedProvider);
  }, [isLoadingModels, isSavingModel, modelOptions, saveModelSelection, selectedModelValue, selectedProvider, setSelectedModel, tabMode]);

  React.useEffect(() => {
    if (tabMode !== "atomic-payg" || !jwt || modeSwitchBusy || authMode !== "atomic-payg") return;
    if (selectedProvider !== "openrouter") {
      setSelectedProvider("openrouter");
    }
    void loadModels("openrouter");
  }, [
    authMode,
    jwt,
    loadModels,
    modeSwitchBusy,
    selectedProvider,
    setSelectedProvider,
    tabMode,
  ]);

  // ── Mode switching ──

  const handleConnectionSelect = React.useCallback(
    async (mode: HermesSetupMode) => {
      setTabMode(mode);
      if (mode === authMode) return;

      setModeSwitchBusy(true);
      try {
        await dispatch(switchMode({ port, target: mode })).unwrap();
        await reloadConfig();
      } catch (err) {
        console.error("[AiModelsTab] switchMode failed:", err);
        setTabMode(authMode);
      } finally {
        setModeSwitchBusy(false);
      }
    },
    [authMode, dispatch, port, reloadConfig],
  );

  // ── Server stop ──

  const [serverStopping, setServerStopping] = React.useState(false);

  const handleServerStop = React.useCallback(async () => {
    setServerStopping(true);
    try {
      await dispatch(stopLlamacppServer()).unwrap();
    } catch (err) {
      console.error("[AiModelsTab] stopServer failed:", err);
    } finally {
      setServerStopping(false);
    }
  }, [dispatch]);

  // ── Status bar model name ──

  const isLlamacppProvider = isProfileUsingLlamacppServer(configSnap);

  const statusModeLabel =
    authMode === "atomic-payg"
      ? MODE_LABELS["atomic-payg"]
      : isLlamacppProvider
        ? MODE_LABELS["local-model"]
        : MODE_LABELS["self-managed"];

  const currentModelName = React.useMemo(() => {
    if (authMode === "atomic-payg") {
      return selectedModelValue || null;
    }
    if (isLlamacppProvider) {
      const localModel = llamacpp.models.find((m) => m.id === llamacpp.activeModelId);
      if (localModel?.name) return localModel.name;
      if (llamacpp.activeModelId) return formatModelIdForStatusBar(llamacpp.activeModelId);
      return null;
    }
    return selectedModelValue || null;
  }, [authMode, isLlamacppProvider, llamacpp.activeModelId, llamacpp.models, selectedModelValue]);

  const runningModelLabel = React.useMemo(() => {
    const uiKey = resolveLlamacppServerUiKey(llamacpp.serverStatus);
    if (uiKey === "stopped") return "None";
    const rawId = llamacpp.serverStatus?.activeModelId ?? llamacpp.activeModelId ?? null;
    if (!rawId) return "None";
    const localModel = llamacpp.models.find((m) => m.id === rawId);
    if (localModel?.name) return localModel.name;
    return formatModelIdForStatusBar(rawId);
  }, [llamacpp.serverStatus, llamacpp.activeModelId, llamacpp.models]);

  const isLocalTab = tabMode === "local-model";
  const isMac = navigator.platform?.toLowerCase().includes("mac") ?? true;

  return (
    <div className={s.root}>
      <div className={s.title}>AI Models</div>

      <AiModelsStatusBar
        isLocalModels={isLocalTab}
        modeLabel={statusModeLabel}
        modelName={currentModelName}
        runningModelLabel={runningModelLabel}
        serverStatus={llamacpp.serverStatus}
        onStop={() => void handleServerStop()}
        stopping={serverStopping}
      />

      <ConnectionToggle
        activeMode={tabMode}
        disabled={modeSwitchBusy}
        onSelect={handleConnectionSelect}
      />

      {modeSwitchBusy && (
        <div className={s.modeSwitchLoader} role="status" aria-live="polite">
          <div className={s.modeSwitchSpinner} aria-hidden="true" />
          <div className={s.modeSwitchLoaderText}>Switching to {MODE_LABELS[tabMode]}...</div>
        </div>
      )}

      {isLocalTab && !modeSwitchBusy && (
        <div className="fade-in">
          {isMac ? (
            <LocalModelsTab port={port} />
          ) : (
            <div className={s.comingSoonBanner}>
              <span className={s.comingSoonIcon}>🖥</span>
              <div className={s.comingSoonBody}>
                <div className={s.comingSoonTitle}>Coming Soon</div>
                <div className={s.comingSoonDesc}>
                  Local models support for this platform is under development. Stay tuned!
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tabMode === "self-managed" && !modeSwitchBusy && (
        <div className="fade-in">
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
      )}

      {tabMode === "atomic-payg" && !modeSwitchBusy && (
        <div className="fade-in">
          {!jwt ? (
            <AtomicSignInPrompt port={port} />
          ) : (
            <>
              <div className={s.dropdownRow}>
                <div className={s.dropdownGroup}>
                  <div className={s.dropdownLabel}>Provider</div>
                  <div style={{ fontSize: 14, color: "#fff", paddingTop: 6 }}>Atomic</div>
                </div>

                <div className={s.dropdownGroup}>
                  <div className={s.dropdownLabel}>Model</div>
                  <RichSelect
                    value={selectedModelValue}
                    onChange={(modelId) => {
                      setSelectedModel(modelId);
                      void saveModelSelection(modelId, "openrouter");
                    }}
                    options={modelOptions}
                    placeholder={
                      modelOptions.length === 0
                        ? "Loading models…"
                        : "Select model..."
                    }
                    disabled={
                      selectedProvider !== "openrouter" ||
                      isLoadingModels ||
                      isSavingModel ||
                      modelOptions.length === 0
                    }
                    disabledStyles={modelOptions.length === 0}
                    onlySelectedIcon
                  />
                </div>
              </div>

              {selectedProvider === "openrouter" && modelOptions.length === 0 && !isLoadingModels ? (
                <div className={s.noModelsHint}>
                  Models could not be loaded. Check your connection or try reloading settings.
                </div>
              ) : null}

              <div style={{ marginTop: 24 }}>
                <AtomicAccountTab port={port} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
