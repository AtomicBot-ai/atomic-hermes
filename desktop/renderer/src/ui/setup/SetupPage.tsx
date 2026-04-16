import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { FullscreenShell, HeroPageLayout } from "@shared/kit";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { setOnboarded } from "@store/slices/onboardingSlice";
import { routes } from "../app/routes";
import {
  checkCapabilities as apiCheckCapabilities,
  getConfig,
  patchConfig,
  fetchModels,
  fetchProviderModels,
  requestDeviceCode,
  pollOAuthToken,
  type CapabilitiesResponse,
  type DeviceCodeResponse,
} from "../../services/api";
import { SetupContext, useSetup, type OAuthStep, type SetupFlowKind } from "./setup-context";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { getSelectedHermesProfile } from "../../services/request-context";
import { seedComputerUseMcpIfMissing } from "../../services/seed-computer-use-mcp";
import { PROVIDERS } from "./providers";
import { WelcomeStep } from "./WelcomeStep";
import { SetupModePage } from "./SetupModePage";
import { LocalBackendSetupPage } from "./LocalBackendSetupPage";
import { LocalModelSelectPage } from "./LocalModelSelectPage";
import { ProviderSelectStep } from "./ProviderSelectStep";
import { ApiKeyStep } from "./ApiKeyStep";
import { ModelSelectStep } from "./ModelSelectStep";
import { FinishStep } from "./FinishStep";
import "./setup.css";

function SetupModeRoute() {
  const navigate = useNavigate();
  const { setSetupFlow } = useSetup();
  const isMac = (getDesktopApiOrNull()?.platform ?? "darwin") === "darwin";
  return (
    <SetupModePage
      localModelComingSoon={!isMac}
      onSelectApiKeys={() => {
        setSetupFlow("api-keys");
        void navigate("../provider", { relative: "path" });
      }}
      onSelectLocalModels={() => {
        setSetupFlow("local-model");
        void navigate("../local-backend-setup", { relative: "path" });
      }}
      onBack={() => {
        setSetupFlow("unset");
        void navigate("..", { relative: "path" });
      }}
    />
  );
}

function LocalBackendSetupRoute() {
  const navigate = useNavigate();
  const { setSetupFlow } = useSetup();
  return (
    <LocalBackendSetupPage
      onContinue={() => void navigate("../local-model-select", { relative: "path" })}
      onBack={() => {
        setSetupFlow("unset");
        void navigate("../setup-mode", { relative: "path" });
      }}
    />
  );
}

function LocalModelSelectRoute() {
  const navigate = useNavigate();
  const { setSetupFlow } = useSetup();
  return (
    <LocalModelSelectPage
      onBack={() => {
        setSetupFlow("unset");
        void navigate("../setup-mode", { relative: "path" });
      }}
    />
  );
}

function openExternal(url: string) {
  const api = (window as any).hermesAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, "_blank");
}

export function SetupPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const gatewayState = useAppSelector((s) => s.gateway.state);
  const port = gatewayState?.kind === "ready" ? gatewayState.port : 8642;

  const [capabilities, setCapabilities] =
    useState<CapabilitiesResponse | null>(null);

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [configuredModel, setConfiguredModel] = useState("");

  const [oauthStep, setOauthStep] = useState<OAuthStep>("idle");
  const [oauthUserCode, setOauthUserCode] = useState("");
  const [oauthVerificationUrl, setOauthVerificationUrl] = useState("");
  const [oauthError, setOauthError] = useState("");
  const [deviceCodeData, setDeviceCodeData] =
    useState<DeviceCodeResponse | null>(null);
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [setupFlow, setSetupFlow] = useState<SetupFlowKind>("unset");

  useEffect(() => {
    return () => {
      if (oauthPollRef.current) clearInterval(oauthPollRef.current);
    };
  }, []);

  const checkCapabilities = useCallback(async () => {
    try {
      const data = await apiCheckCapabilities(port);
      setCapabilities(data);
    } catch {
      setCapabilities(null);
    }
  }, [port]);

  const loadCurrentConfig = useCallback(async () => {
    try {
      const data = await getConfig(port);
      if (data.activeModel) {
        setConfiguredModel(data.activeModel);
        setSelectedModel((c) => c || data.activeModel);
      }
      if (data.activeProvider) {
        setSelectedProvider((c) => c || data.activeProvider);
      }
    } catch {
      // ignore
    }
  }, [port]);

  const loadModels = useCallback(
    async (provider?: string) => {
      const pid = provider || selectedProvider;
      try {
        let ids: string[];
        if (pid) {
          const models = await fetchProviderModels(port, pid);
          ids = models.map((m) => m.id).slice(0, 30);
        } else {
          const models = await fetchModels(port);
          ids = models.map((m) => m.id).slice(0, 30);
        }
        setAvailableModels(ids);
        setSelectedModel((c) => c || ids[0] || "");
      } catch {
        setAvailableModels([]);
      }
    },
    [port, selectedProvider],
  );

  const saveProviderConfig = useCallback(async () => {
    const provider = PROVIDERS.find((p) => p.id === selectedProvider);
    const canEditConfig = capabilities?.capabilities?.config ?? false;
    if (!selectedProvider || !canEditConfig) return true;
    setSaving(true);
    setSaveError("");
    try {
      const body: Record<string, unknown> = {
        config: { provider: selectedProvider },
      };
      const envPatch: Record<string, string> = {};
      if (provider?.envKey && apiKey) envPatch[provider.envKey] = apiKey;
      if (baseUrl) {
        (body.config as Record<string, unknown>).base_url = baseUrl;
      }
      if (Object.keys(envPatch).length > 0) {
        (body as Record<string, unknown>).env = envPatch;
      }
      await patchConfig(port, body as any);
      await loadCurrentConfig();
      await loadModels();
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    apiKey,
    baseUrl,
    capabilities,
    loadCurrentConfig,
    loadModels,
    port,
    selectedProvider,
  ]);

  const saveModelSelection = useCallback(async () => {
    const model = selectedModel || configuredModel;
    const canEditConfig = capabilities?.capabilities?.config ?? false;
    if (!model || !canEditConfig || !selectedProvider) return true;
    setConfiguredModel(model);
    try {
      await patchConfig(port, {
        config: { model, provider: selectedProvider },
      });
      return true;
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save model",
      );
      return false;
    }
  }, [capabilities, configuredModel, port, selectedModel, selectedProvider]);

  const startOAuth = useCallback(async () => {
    const provider = PROVIDERS.find((p) => p.id === selectedProvider);
    if (!provider?.oauthProvider) return;
    setOauthStep("loading");
    setOauthError("");
    try {
      const data = await requestDeviceCode(port, provider.oauthProvider);
      if (!data.ok) {
        setOauthError(data.error || "Failed to start OAuth");
        setOauthStep("error");
        return;
      }
      setDeviceCodeData(data);
      setOauthUserCode(data.user_code || "");
      setOauthVerificationUrl(data.verification_uri_complete || "");
      setOauthStep("waiting");

      if (data.verification_uri_complete) {
        openExternal(data.verification_uri_complete);
      }

      const intervalMs = Math.max((data.interval || 5) * 1000, 3000);
      oauthPollRef.current = setInterval(async () => {
        try {
          const extra: Record<string, string> = {};
          if (data.client_id) extra.client_id = data.client_id;
          if (data.portal_base_url)
            extra.portal_base_url = data.portal_base_url;
          if (data.user_code) extra.user_code = data.user_code;

          const poll = await pollOAuthToken(
            port,
            provider!.oauthProvider!,
            data.device_code || "",
            extra,
          );

          if (poll.status === "success") {
            if (oauthPollRef.current) clearInterval(oauthPollRef.current);
            setOauthStep("success");
            await loadModels();
          } else if (poll.status === "error") {
            if (oauthPollRef.current) clearInterval(oauthPollRef.current);
            setOauthError(poll.message || "Authentication failed");
            setOauthStep("error");
          }
        } catch {
          // keep polling on network errors
        }
      }, intervalMs);
    } catch (err) {
      setOauthError(
        err instanceof Error ? err.message : "Failed to start OAuth",
      );
      setOauthStep("error");
    }
  }, [port, selectedProvider, loadModels]);

  const complete = useCallback(() => {
    const profileId = getSelectedHermesProfile() ?? "default";
    void seedComputerUseMcpIfMissing(port, profileId);
    dispatch(setOnboarded(true));
    navigate(routes.chat, { replace: true });
  }, [dispatch, navigate, port]);

  const skip = complete;

  const ctxValue = React.useMemo(
    () => ({
      port,
      capabilities,
      setCapabilities,
      selectedProvider,
      setSelectedProvider,
      apiKey,
      setApiKey,
      baseUrl,
      setBaseUrl,
      saving,
      saveError,
      setSaveError,
      availableModels,
      setAvailableModels,
      selectedModel,
      setSelectedModel,
      configuredModel,
      setConfiguredModel,
      oauthStep,
      setOauthStep,
      oauthUserCode,
      setOauthUserCode,
      oauthVerificationUrl,
      setOauthVerificationUrl,
      oauthError,
      setOauthError,
      deviceCodeData,
      setDeviceCodeData,
      oauthPollRef,
      setupFlow,
      setSetupFlow,
      checkCapabilities,
      loadCurrentConfig,
      loadModels,
      saveProviderConfig,
      saveModelSelection,
      startOAuth,
      complete,
      skip,
    }),
    [
      port,
      capabilities,
      selectedProvider,
      apiKey,
      baseUrl,
      saving,
      saveError,
      availableModels,
      selectedModel,
      configuredModel,
      oauthStep,
      oauthUserCode,
      oauthVerificationUrl,
      oauthError,
      deviceCodeData,
      setupFlow,
      checkCapabilities,
      loadCurrentConfig,
      loadModels,
      saveProviderConfig,
      saveModelSelection,
      startOAuth,
      complete,
      skip,
    ],
  );

  return (
    <SetupContext.Provider value={ctxValue}>
      <FullscreenShell role="main" aria-label="Setup wizard">
        <HeroPageLayout context="onboarding" hideTopbar align="center">
          <Routes>
            <Route index element={<WelcomeStep />} />
            <Route path="setup-mode" element={<SetupModeRoute />} />
            <Route path="provider" element={<ProviderSelectStep />} />
            <Route path="api-key" element={<ApiKeyStep />} />
            <Route path="model" element={<ModelSelectStep />} />
            <Route path="local-backend-setup" element={<LocalBackendSetupRoute />} />
            <Route path="local-model-select" element={<LocalModelSelectRoute />} />
            <Route path="finish" element={<FinishStep />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </HeroPageLayout>
      </FullscreenShell>
    </SetupContext.Provider>
  );
}
