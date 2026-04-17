import React from "react";
import { GlassCard, PrimaryButton, SecondaryButton, SplashLogo } from "@shared/kit";
import { InfoIcon } from "@shared/kit/icons";
import { useOnboardingStepEvent } from "@analytics";
import { OnboardingHeader } from "./OnboardingHeader";
import { useSetup } from "./setup-context";
import s from "./SetupModePage.module.css";

export type SetupModeChoice = "api-keys" | "local-model";

export function SetupModePage(props: {
  localModelComingSoon: boolean;
  onSelectApiKeys: () => void;
  onSelectLocalModels: () => void;
  onBack: () => void;
}) {
  useOnboardingStepEvent("setup_mode", null);
  const { skip } = useSetup();

  return (
    <>
      <OnboardingHeader totalSteps={0} activeStep={0} onBack={props.onBack} onSkip={skip} />
      <GlassCard className={s.UiSetupModeCard}>
        <div className="UiSectionContent">
          <div>
            <div className="UiSectionTitle">Choose how to run Atomic Hermes</div>
            <div className="UiSectionSubtitle">
              Pick what works for you — you can switch anytime in settings.
            </div>
          </div>

          <div className={s.UiSetupModeOptions}>
            <div className={`UiSectionCard UiSectionCardGreen ${s.UiSetupModeOptionCard}`}>
              <div className={s.UiSetupModeCardBody}>
                <div className={s.UiSetupModeIcon}>
                  <SplashLogo size={35} />
                </div>
                <div className={s.UiSetupModeTitle}>Your own API keys</div>
                <div className={s.UiSetupModeDesc}>Pay providers directly</div>
                <ul className={s.UiSetupModeFeatures}>
                  <li>OpenRouter, Ollama, Anthropic and others</li>
                  <li>Full control over models and spending</li>
                  <li>Pay only for what you use</li>
                </ul>
              </div>
              <div className={s.UiSetupModeCardFooter}>
                <PrimaryButton size="sm" onClick={props.onSelectApiKeys}>
                  Connect API keys
                </PrimaryButton>
              </div>
            </div>

            <div
              className={`UiSectionCard ${s.UiSetupModeOptionCard} ${props.localModelComingSoon ? s.UiSetupModeOptionCardComingSoon : ""}`}
            >
              <div className={s.UiSetupModeCardBody}>
                <div className={s.UiSetupModeIcon}>
                  <span style={{ fontSize: 24 }} aria-hidden="true">
                    🖥
                  </span>
                </div>
                <div className={s.UiSetupModeTitle}>Free local models</div>
                <div className={s.UiSetupModeDesc}>Fully private</div>
                <ul className={s.UiSetupModeFeatures}>
                  <li>Works offline</li>
                  <li>Your data never leaves your machine</li>
                  <li className={s.UiSetupModeFeatureNote}>
                    <span className={s.UiSetupModeFeatureNoteIcon} aria-hidden="true">
                      <InfoIcon />
                    </span>
                    <span>{props.localModelComingSoon ? "macOS only for now" : "macOS only"}</span>
                  </li>
                </ul>
              </div>
              <div className={s.UiSetupModeCardFooter}>
                {props.localModelComingSoon ? (
                  <SecondaryButton size="sm" disabled onClick={() => {}}>
                    Coming soon
                  </SecondaryButton>
                ) : (
                  <SecondaryButton size="sm" onClick={props.onSelectLocalModels}>
                    Set up local models
                  </SecondaryButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </>
  );
}
