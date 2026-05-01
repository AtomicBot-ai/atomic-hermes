import React from "react";
import { useNavigate } from "react-router-dom";
import { InlineError, PrimaryButton } from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics";
import { OnboardingHeader } from "../OnboardingHeader";
import { useSetup } from "../setup-context";
import { RichSelect, type RichOption } from "../RichSelect";
import { getModelTier, TIER_INFO } from "../model-presentation";
import { resolveProviderIconUrl } from "../providers";
import { ATOMIC_PAYG_FLOW } from "../onboarding-steps";
import {
  fetchProviderModels,
  patchConfig,
  type ProviderModelEntry,
} from "../../../services/api";
import s from "../ModelSelectStep.module.css";

const ATOMIC_DEFAULT_MODEL = "gemini-3-flash-preview";
const ATOMIC_PROVIDER = "openrouter";

function sortProviderModels(models: ProviderModelEntry[]): ProviderModelEntry[] {
  const pinId = ATOMIC_DEFAULT_MODEL;
  const TIER_RANK: Record<string, number> = { ultra: 0, pro: 1, fast: 2 };
  return models.slice().sort((a, b) => {
    const aPin = a.id === pinId || a.id.includes(pinId) ? 1 : 0;
    const bPin = b.id === pinId || b.id.includes(pinId) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    const tierA = getModelTier(a.id);
    const tierB = getModelTier(b.id);
    const rankA = tierA ? (TIER_RANK[tierA] ?? 99) : 99;
    const rankB = tierB ? (TIER_RANK[tierB] ?? 99) : 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.id.localeCompare(b.id);
  });
}

export function AtomicModelSelectStep() {
  useOnboardingStepEvent("model_select", "atomic-payg");
  const navigate = useNavigate();
  const ctx = useSetup();
  const [saving, setSaving] = React.useState(false);
  const [models, setModels] = React.useState<ProviderModelEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);

  const loadOpenRouterModels = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const list = await fetchProviderModels(ctx.port, ATOMIC_PROVIDER);
      setModels(list);
    } catch (err) {
      setFetchError(String(err));
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [ctx.port]);

  React.useEffect(() => {
    ctx.setSelectedProvider(ATOMIC_PROVIDER);
    void ctx.loadCurrentConfig();
    void loadOpenRouterModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const sortedModels = React.useMemo(
    () => sortProviderModels(models),
    [models],
  );

  React.useEffect(() => {
    if (sortedModels.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) => {
      if (prev && sortedModels.some((m) => m.id === prev)) return prev;
      const pinId = ATOMIC_DEFAULT_MODEL;
      const preferred = sortedModels.find(
        (m) => m.id === pinId || m.id.includes(pinId),
      );
      return (preferred ?? sortedModels[0])!.id;
    });
  }, [sortedModels]);

  const modelOptions: RichOption<string>[] = React.useMemo(() => {
    const providerIcon = resolveProviderIconUrl(ATOMIC_PROVIDER);
    return sortedModels.map((m) => {
      const tier = getModelTier(m.id);
      const badge = tier
        ? { text: TIER_INFO[tier].label, variant: tier }
        : undefined;
      return {
        value: m.id,
        label: m.id,
        icon: providerIcon,
        meta: m.description?.trim() ? m.description : undefined,
        badge,
      };
    });
  }, [sortedModels]);

  const [saveError, setSaveError] = React.useState<string | null>(null);

  const handleContinue = React.useCallback(async () => {
    const model = selected || ctx.configuredModel;
    if (!model) return;
    setSaving(true);
    setSaveError(null);
    try {
      // The shared saveModelSelection() bails out when capabilities haven't
      // been probed (Atomic-PAYG flow never calls checkCapabilities), so we
      // patch config directly with the picked model + openrouter provider.
      await patchConfig(ctx.port, {
        config: { model, provider: ATOMIC_PROVIDER },
      });
      ctx.setSelectedProvider(ATOMIC_PROVIDER);
      ctx.setSelectedModel(model);
      ctx.setConfiguredModel(model);
      void navigate("../finish", { relative: "path" });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setSaving(false);
    }
  }, [ctx, navigate, selected]);

  let body: React.ReactNode;
  if (loading) {
    body = (
      <>
        <h2 className="SetupTitle">Select AI Model</h2>
        <p className="SetupSubtitle">
          Fetching available models from your configured provider.
        </p>
      </>
    );
  } else if (fetchError) {
    body = (
      <>
        <h2 className="SetupTitle">Select AI Model</h2>
        <p className="SetupSubtitle">Failed to load models.</p>
      </>
    );
  } else if (sortedModels.length === 0) {
    body = (
      <>
        <h2 className="SetupTitle">Select AI Model</h2>
        <p className="SetupSubtitle">
          No models were found for your configured API key. The key may be
          invalid or the provider may be temporarily unavailable.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <h2 className="SetupTitle">Select AI Model</h2>
        <p className="SetupSubtitle">
          Choose your preferred model. You can change this later in settings.
        </p>
        <div className={s.dropdownWrap}>
          <span className={s.dropdownLabel}>Current Model</span>
          <RichSelect
            value={selected}
            onChange={(value) => setSelected(value)}
            options={modelOptions}
            placeholder={
              modelOptions.length === 0 ? "No models available" : "Select model…"
            }
            disabled={modelOptions.length === 0}
            disabledStyles={modelOptions.length === 0}
            onlySelectedIcon
          />
          <p className={s.footnote}>
            Different models may consume different amounts of AI credits.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <OnboardingHeader
        totalSteps={ATOMIC_PAYG_FLOW.totalSteps}
        activeStep={ATOMIC_PAYG_FLOW.steps.model}
        onBack={() => void navigate("../atomic-topup", { relative: "path" })}
        onSkip={ctx.skip}
      />
      <div className="SetupCard">
        <div className="SetupCard__content">
          {body}
          {fetchError && <InlineError>{fetchError}</InlineError>}
          {saveError && <InlineError>{saveError}</InlineError>}
        </div>

        {!loading && fetchError && (
          <div className="SetupCard__footer">
            <span />
            <PrimaryButton size="sm" onClick={() => void loadOpenRouterModels()}>
              Retry
            </PrimaryButton>
          </div>
        )}

        {!loading && !fetchError && sortedModels.length === 0 && (
          <div className="SetupCard__footer">
            <span />
            <PrimaryButton size="sm" onClick={() => void loadOpenRouterModels()}>
              Retry
            </PrimaryButton>
          </div>
        )}

        {!loading && !fetchError && sortedModels.length > 0 && (
          <div className="SetupCard__footer">
            <span />
            <PrimaryButton
              size="sm"
              disabled={!selected && !ctx.configuredModel}
              loading={saving}
              onClick={() => void handleContinue()}
            >
              Continue
            </PrimaryButton>
          </div>
        )}
      </div>
    </>
  );
}
