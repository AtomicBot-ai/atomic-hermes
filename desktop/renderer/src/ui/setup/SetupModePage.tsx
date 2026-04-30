import React from "react";
import {
  GlassCard,
  PrimaryButton,
  SecondaryButton,
  SplashLogo,
} from "@shared/kit";
import { InfoIcon } from "@shared/kit/icons";
import { useOnboardingStepEvent } from "@analytics";
import { OnboardingHeader } from "./OnboardingHeader";
import { useSetup } from "./setup-context";
import s from "./SetupModePage.module.css";
import { ATOMIC_PAYG_FLOW } from "./onboarding-steps";

export type SetupModeChoice = "api-keys" | "local-model" | "atomic-payg";

export function SetupModePage(props: {
  localModelComingSoon: boolean;
  atomicBusy?: boolean;
  atomicError?: string | null;
  atomicSignedInEmail?: string | null;
  onSelectApiKeys: () => void;
  onSelectLocalModels: () => void;
  onSelectAtomicPayg: () => Promise<void> | void;
  onBack: () => void;
}) {
  useOnboardingStepEvent("setup_mode", null);
  const { skip } = useSetup();

  return (
    <>
      <OnboardingHeader
        totalSteps={ATOMIC_PAYG_FLOW.totalSteps}
        activeStep={ATOMIC_PAYG_FLOW.steps.setupMode}
        onBack={props.onBack}
        onSkip={skip}
      />
      <GlassCard className={s.UiSetupModeCard}>
        <div className="UiSectionContent">
          <div>
            <div className="UiSectionTitle">
              Choose how to run Atomic Hermes
            </div>
            <div className="UiSectionSubtitle">
              Pick what works for you — you can switch anytime in settings.
            </div>
          </div>

          <div className={s.UiSetupModeOptions}>
            <div
              className={`UiSectionCard UiSectionCardPurple ${s.UiSetupModeOptionCard} ${s.UiSetupModeOptionCardFeatured}`}
            >
              <div className={s.UiSetupModeCardBody}>
                <div className={s.UiSetupModeIcon}>
                  <SplashLogo size={35} />
                </div>
                <div className={s.UiSetupModeTitle}>Pay as you go</div>
                <ul className={s.UiSetupModeFeatures}>
                  <li>Start in seconds</li>
                  <li>Access to 100+ AI models</li>
                  <li>Full control over spend</li>
                </ul>

                {props.atomicBusy ? (
                  <div className={s.UiSetupModeStatus}>
                    <span className="UiButtonSpinner" aria-hidden="true" />

                    <span>
                      {props.atomicSignedInEmail
                        ? `Configuring account for ${props.atomicSignedInEmail}...`
                        : "Waiting for Google sign-in..."}
                    </span>
                  </div>
                ) : null}

                {props.atomicSignedInEmail && !props.atomicBusy ? (
                  <div className={s.UiSetupModeStatusSuccess}>
                    <span
                      className={s.UiSetupModeStatusDot}
                      aria-hidden="true"
                    />

                    <span>Signed in as {props.atomicSignedInEmail}</span>
                  </div>
                ) : null}

                {props.atomicError ? (
                  <div className={s.UiSetupModeError}>{props.atomicError}</div>
                ) : null}
              </div>
              <div className={s.UiSetupModeCardFooter}>
                <PrimaryButton
                  size="sm"
                  onClick={props.onSelectAtomicPayg}
                  disabled={props.atomicBusy}
                >
                  {props.atomicBusy ? "Connecting..." : "Continue with Google"}
                </PrimaryButton>
              </div>
            </div>

            <div
              className={`UiSectionCard UiSectionCardGreen ${s.UiSetupModeOptionCard}`}
            >
              <div className={s.UiSetupModeCardBody}>
                <div className={s.UiSetupModeIcon}>
                  <span style={{ fontSize: 24 }} aria-hidden="true">
                    🔑
                  </span>
                </div>
                <div className={s.UiSetupModeTitle}>Your own API keys</div>
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
                <ul className={s.UiSetupModeFeatures}>
                  <li>Works offline</li>
                  <li>Your data never leaves your machine</li>
                  <li className={s.UiSetupModeFeatureNote}>
                    <span
                      className={s.UiSetupModeFeatureNoteIcon}
                      aria-hidden="true"
                    >
                      <InfoIcon />
                    </span>
                    <span>
                      {props.localModelComingSoon
                        ? "macOS only for now"
                        : "macOS only"}
                    </span>
                  </li>
                </ul>
              </div>
              <div className={s.UiSetupModeCardFooter}>
                {props.localModelComingSoon ? (
                  <SecondaryButton size="sm" disabled onClick={() => {}}>
                    Coming soon
                  </SecondaryButton>
                ) : (
                  <PrimaryButton size="sm" onClick={props.onSelectLocalModels}>
                    Set up local models
                  </PrimaryButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </>
  );
}
