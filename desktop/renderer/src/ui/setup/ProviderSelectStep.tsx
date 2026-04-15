import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard, PrimaryButton } from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics";
import { OnboardingHeader } from "./OnboardingHeader";
import { useSetup } from "./setup-context";
import { PROVIDERS, resolveProviderIconUrl } from "./providers";
import { TOTAL_STEPS } from "./SetupPage";

export function ProviderSelectStep() {
  useOnboardingStepEvent("provider_select");
  const navigate = useNavigate();
  const ctx = useSetup();

  useEffect(() => {
    void ctx.checkCapabilities();
    void ctx.loadCurrentConfig();
  }, []);

  useEffect(() => {
    if (!ctx.selectedProvider) {
      ctx.setSelectedProvider(PROVIDERS[0].id);
    }
  }, [ctx.selectedProvider]);

  const handleProviderSelect = useCallback(
    (id: string) => {
      ctx.setSelectedProvider(id);
      ctx.setApiKey("");
      ctx.setBaseUrl("");
      ctx.setSaveError("");
      ctx.setSelectedModel("");
      if (ctx.oauthPollRef.current) clearInterval(ctx.oauthPollRef.current);
      ctx.setOauthStep("idle");
      ctx.setOauthUserCode("");
      ctx.setOauthVerificationUrl("");
      ctx.setOauthError("");
      ctx.setDeviceCodeData(null);
    },
    [ctx],
  );

  const handleContinue = useCallback(() => {
    void navigate("../api-key", { relative: "path" });
  }, [navigate]);

  return (
    <>
      <OnboardingHeader
        totalSteps={TOTAL_STEPS}
        activeStep={1}
        onBack={() => void navigate("..", { relative: "path" })}
        onSkip={ctx.skip}
      />
      <GlassCard className="UiProviderCard UiGlassCardOnboarding">
        <div className="UiSectionTitle">Choose AI Provider</div>
        <div className="UiSectionSubtitle">
          Pick the AI provider you want to start with. You can switch or add
          more providers later.
        </div>

        <div className="UiProviderList UiListWithScroll scrollable">
          {PROVIDERS.map((provider) => {
            const iconUrl = resolveProviderIconUrl(provider.id);
            const isSelected = ctx.selectedProvider === provider.id;

            return (
              <label
                key={provider.id}
                className={`UiProviderOption${isSelected ? " UiProviderOption--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider.id}
                  checked={isSelected}
                  onChange={() => handleProviderSelect(provider.id)}
                  className="UiProviderRadio"
                />
                <span className="UiProviderIconWrap" aria-hidden="true">
                  {iconUrl ? (
                    <img className="UiProviderIcon" src={iconUrl} alt="" />
                  ) : (
                    <span className="UiProviderEmoji">{provider.emoji || "⚙"}</span>
                  )}
                </span>
                <div className="UiProviderContent">
                  <div className="UiProviderHeader">
                    <span className="UiProviderName">{provider.name}</span>
                    {provider.recommended && (
                      <span className="UiProviderBadge">Recommended</span>
                    )}
                    {provider.popular && (
                      <span className="UiProviderBadgePopular">Popular</span>
                    )}
                    {provider.localModels && (
                      <span className="UiProviderBadgeLocal">Local models</span>
                    )}
                    {provider.privacyFirst && (
                      <span className="UiProviderBadgePrivacy">Privacy First</span>
                    )}
                  </div>
                  <div className="UiProviderDescription">{provider.desc}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="UiProviderContinueRow">
          <div />
          <PrimaryButton
            size="sm"
            disabled={!ctx.selectedProvider}
            onClick={handleContinue}
          >
            Continue
          </PrimaryButton>
        </div>
      </GlassCard>
    </>
  );
}
