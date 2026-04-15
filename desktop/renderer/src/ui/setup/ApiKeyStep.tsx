import React, { useCallback, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  GlassCard,
  InlineError,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics";
import { OnboardingHeader } from "./OnboardingHeader";
import { TOTAL_STEPS } from "./SetupPage";
import { useSetup } from "./setup-context";
import { PROVIDERS } from "./providers";

function openExternal(url: string) {
  const api = (window as any).hermesAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, "_blank");
}

export function ApiKeyStep() {
  useOnboardingStepEvent("api_key");
  const navigate = useNavigate();
  const ctx = useSetup();

  useEffect(() => {
    void ctx.checkCapabilities();
    void ctx.loadCurrentConfig();
  }, []);

  const provider = PROVIDERS.find((item) => item.id === ctx.selectedProvider);
  const canEditConfig = ctx.capabilities?.capabilities?.config ?? false;
  const isOAuth = provider?.authType === "oauth";
  const needsApiKey =
    provider?.authType === "api_key" || provider?.authType === "custom";
  const needsBaseUrl =
    provider?.id === "ollama" || provider?.authType === "custom";
  const requiresOAuthCompletion = Boolean(provider && isOAuth && canEditConfig);
  const isWaitingForOAuth =
    isOAuth && (ctx.oauthStep === "loading" || ctx.oauthStep === "waiting");
  const shouldShowOAuthPanel =
    isOAuth && (ctx.oauthStep !== "idle" || !canEditConfig);

  const handleContinue = useCallback(async () => {
    if (!provider) {
      return;
    }

    if (requiresOAuthCompletion && ctx.oauthStep !== "success") {
      return;
    }

    let ok = true;
    if (canEditConfig) {
      ok = await ctx.saveProviderConfig();
    }

    if (ok) {
      void navigate("../model", { relative: "path" });
    }
  }, [canEditConfig, ctx, navigate, provider, requiresOAuthCompletion]);

  const handlePrimaryAction = useCallback(async () => {
    if (isOAuth && ctx.oauthStep !== "success") {
      if (!canEditConfig || isWaitingForOAuth) {
        return;
      }
      await ctx.startOAuth();
      return;
    }

    await handleContinue();
  }, [canEditConfig, ctx, handleContinue, isOAuth, isWaitingForOAuth]);

  if (!provider) {
    return <Navigate to="../provider" replace relative="path" />;
  }

  return (
    <>
      <OnboardingHeader
        totalSteps={TOTAL_STEPS}
        activeStep={2}
        onBack={() => void navigate("../provider", { relative: "path" })}
        onSkip={ctx.skip}
      />

      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        {isOAuth ? (
          <>
            <div className="UiApiKeyTitle">Connect {provider.name}</div>
            <div className="UiApiKeySubtitle">
              {provider.helpText ?? `Connect your ${provider.name} account to continue.`}{" "}
              {provider.helpUrl ? (
                <a
                  href={provider.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="UiLink"
                  onClick={(event) => {
                    event.preventDefault();
                    openExternal(provider.helpUrl!);
                  }}
                >
                  Learn more ↗
                </a>
              ) : null}
            </div>

            {shouldShowOAuthPanel && (
              <div className="SetupOAuth">
                {ctx.oauthStep === "loading" && (
                  <div className="SetupStatus">
                    <span className="SetupStatus__dot SetupStatus__dot--checking" />
                    <span className="SetupStatus__text">Starting OAuth flow...</span>
                  </div>
                )}

                {ctx.oauthStep === "waiting" && (
                  <>
                    <div className="SetupStatus">
                      <span className="SetupStatus__dot SetupStatus__dot--checking" />
                      <span className="SetupStatus__text">Waiting for approval...</span>
                    </div>

                    {ctx.oauthUserCode && (
                      <>
                        <div className="SetupOAuth__label">Your code</div>
                        <div className="SetupOAuth__code">{ctx.oauthUserCode}</div>
                      </>
                    )}

                    {ctx.oauthVerificationUrl && (
                      <button
                        type="button"
                        className="SetupOAuth__link"
                        onClick={() => openExternal(ctx.oauthVerificationUrl)}
                      >
                        Open {provider.name} ↗
                      </button>
                    )}
                  </>
                )}

                {ctx.oauthStep === "success" && (
                  <div className="SetupStatus">
                    <span className="SetupStatus__dot SetupStatus__dot--ready" />
                    <span className="SetupStatus__text SetupStatus__text--success">
                      Authenticated successfully.
                    </span>
                  </div>
                )}

                {ctx.oauthStep === "error" && (
                  <>
                    <div className="SetupStatus">
                      <span className="SetupStatus__dot SetupStatus__dot--error" />
                      <span className="SetupStatus__text SetupStatus__text--error">
                        {ctx.oauthError || "Authentication failed"}
                      </span>
                    </div>
                    {canEditConfig && (
                      <div className="SetupOAuth__actions">
                        <SecondaryButton
                          size="sm"
                          onClick={() => void ctx.startOAuth()}
                        >
                          Retry
                        </SecondaryButton>
                      </div>
                    )}
                  </>
                )}

                {!canEditConfig && (
                  <div className="SetupStatus">
                    <span className="SetupStatus__dot SetupStatus__dot--checking" />
                    <span className="SetupStatus__text">
                      OAuth configuration is unavailable in this environment.
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="UiApiKeyTitle">
              {provider.id === "custom"
                ? "Configure Custom Provider"
                : provider.id === "ollama"
                  ? "Connect Ollama"
                  : `Enter ${provider.name} API Key`}
            </div>
            <div className="UiApiKeySubtitle">
              {provider.helpText ?? "Enter your provider credentials to continue."}{" "}
              {provider.helpUrl ? (
                <a
                  href={provider.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="UiLink"
                  onClick={(event) => {
                    event.preventDefault();
                    openExternal(provider.helpUrl!);
                  }}
                >
                  Learn more ↗
                </a>
              ) : null}
            </div>

            <div className="SetupFields">
              {needsBaseUrl && (
                <div className="UiApiKeyInputRow">
                  <TextInput
                    label={provider.id === "ollama" ? "Ollama URL" : "Base URL"}
                    value={ctx.baseUrl}
                    onChange={ctx.setBaseUrl}
                    placeholder={
                      provider.id === "ollama"
                        ? "http://localhost:11434"
                        : "https://api.example.com/v1"
                    }
                  />
                </div>
              )}

              {needsApiKey && (
                <div className="UiApiKeyInputRow">
                  <TextInput
                    label={`${provider.name} API key`}
                    type="password"
                    value={ctx.apiKey}
                    onChange={ctx.setApiKey}
                    placeholder={provider.placeholder ?? "sk-..."}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          </>
        )}

        <div className="UiApiKeySpacer" aria-hidden="true" />

        {ctx.saveError && <InlineError>{ctx.saveError}</InlineError>}

        <div className="UiApiKeyButtonRow">
          <div />
          <PrimaryButton
            size="sm"
            loading={ctx.saving || (isOAuth && ctx.oauthStep === "loading")}
            disabled={
              (!canEditConfig && isOAuth) ||
              (isOAuth && ctx.oauthStep === "waiting")
            }
            onClick={() => void handlePrimaryAction()}
          >
            {isOAuth && ctx.oauthStep !== "success"
              ? `Connect with ${provider.name}`
              : "Continue"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </>
  );
}
