import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PrimaryButton, TextInput, InlineError } from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics";
import { OnboardingHeader } from "./OnboardingHeader";
import { useSetup } from "./setup-context";
import { RichSelect, type RichOption } from "./RichSelect";
import { getModelTier, TIER_INFO } from "./model-presentation";
import { resolveProviderIconUrl } from "./providers";
import { TOTAL_STEPS } from "./SetupPage";
import s from "./ModelSelectStep.module.css";

export function ModelSelectStep() {
  useOnboardingStepEvent("model_select");
  const navigate = useNavigate();
  const ctx = useSetup();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ctx.selectedProvider) {
      void ctx.loadModels(ctx.selectedProvider);
    }
    void ctx.loadCurrentConfig();
  }, []);

  const modelOptions: RichOption<string>[] = React.useMemo(() => {
    const TIER_RANK: Record<string, number> = { ultra: 0, pro: 1, fast: 2 };

    const sorted = ctx.availableModels.slice().sort((a, b) => {
      const tierA = getModelTier(a);
      const tierB = getModelTier(b);
      const rankA = tierA ? (TIER_RANK[tierA] ?? 99) : 99;
      const rankB = tierB ? (TIER_RANK[tierB] ?? 99) : 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    });

    const providerIcon = ctx.selectedProvider
      ? resolveProviderIconUrl(ctx.selectedProvider)
      : undefined;

    return sorted.map((id) => {
      const tier = getModelTier(id);
      const badge = tier
        ? { text: TIER_INFO[tier].label, variant: tier }
        : undefined;
      return {
        value: id,
        label: id,
        icon: providerIcon,
        badge,
      };
    });
  }, [ctx.availableModels, ctx.selectedProvider]);

  useEffect(() => {
    if (modelOptions.length > 0 && !ctx.selectedModel) {
      ctx.setSelectedModel(modelOptions[0].value);
    }
  }, [modelOptions, ctx.selectedModel]);

  const handleContinue = useCallback(async () => {
    setSaving(true);
    try {
      const ok = await ctx.saveModelSelection();
      if (ok) {
        void navigate("../finish", { relative: "path" });
      }
    } finally {
      setSaving(false);
    }
  }, [ctx, navigate]);

  return (
    <>
      <OnboardingHeader
        totalSteps={TOTAL_STEPS}
        activeStep={3}
        onBack={() => void navigate("../api-key", { relative: "path" })}
        onSkip={ctx.skip}
      />
      <div className="SetupCard">
        <div className="SetupCard__content">
          <h2 className="SetupTitle">Select AI Model</h2>
          <p className="SetupSubtitle">
            Choose your preferred model. You can change this later in settings.
          </p>

          {ctx.availableModels.length > 0 ? (
            <div className={s.dropdownWrap}>
              <span className={s.dropdownLabel}>Current Model</span>
              <RichSelect
                value={ctx.selectedModel || null}
                onChange={ctx.setSelectedModel}
                options={modelOptions}
                placeholder={
                  modelOptions.length === 0
                    ? "No models available"
                    : "Select model…"
                }
                disabled={modelOptions.length === 0}
                disabledStyles={modelOptions.length === 0}
                onlySelectedIcon
              />
              <p className={s.footnote}>
                Different models have different capabilities and speed.
              </p>
            </div>
          ) : (
            <div className="SetupFields">
              <TextInput
                label="Model"
                value={ctx.selectedModel}
                onChange={ctx.setSelectedModel}
                placeholder={ctx.configuredModel || "gpt-4.1"}
              />
            </div>
          )}

          {ctx.saveError && <InlineError>{ctx.saveError}</InlineError>}
        </div>

        <div className="SetupCard__footer">
          <span />
          <PrimaryButton
            size="sm"
            disabled={!ctx.selectedModel && !ctx.configuredModel}
            loading={saving}
            onClick={() => void handleContinue()}
          >
            Continue
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}
