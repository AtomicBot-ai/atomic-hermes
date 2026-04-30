import React from "react";
import { useNavigate } from "react-router-dom";
import {
  GlassCard,
  InlineError,
  PrimaryButton,
  SecondaryButton,
  CheckIcon,
} from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { atomicAuthActions } from "@store/slices/atomicAuthSlice";
import { OnboardingHeader } from "../OnboardingHeader";
import { useSetup } from "../setup-context";
import { ATOMIC_PAYG_FLOW } from "../onboarding-steps";
import {
  atomicBackendApi,
  clearPostPaygSuccessNavigate,
  getStripePaygSuccessUrl,
  rememberPostPaygSuccessNavigate,
  STRIPE_PAYG_CANCEL_URL,
} from "../../../services/atomic-backend-api";
import { routes } from "../../app/routes";
import s from "./AtomicTopupPage.module.css";

const DEFAULT_TOPUP_AMOUNT_USD = 10;

const FEATURES = [
  "Starter credits to get going",
  "100+ skills and connected apps",
  "Fully encrypted and secure",
  "24/7 access to your agent",
  "1000+ AI models via OpenRouter",
  "Priority support",
  "No subscription, no commitments",
] as const;

function openExternal(url: string): void {
  const api = (window as { hermesAPI?: { openExternal?: (u: string) => void } })
    .hermesAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, "_blank");
}

export function AtomicTopupPage() {
  useOnboardingStepEvent("atomic_payg_topup", "atomic-payg");
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const ctx = useSetup();
  const jwt = useAppSelector((state) => state.atomicAuth.jwt);
  const topupPending = useAppSelector((state) => state.atomicAuth.topupPending);

  const [busy, setBusy] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [amountInput, setAmountInput] = React.useState(
    String(DEFAULT_TOPUP_AMOUNT_USD),
  );

  const postPayModelPath = `${routes.setup}/atomic-model`;

  const parsedAmount = Number(amountInput);
  const amountUsd = Number.isFinite(parsedAmount) ? parsedAmount : NaN;
  const amountInvalid =
    !amountInput.trim() ||
    !Number.isFinite(amountUsd) ||
    amountUsd <= 0 ||
    amountUsd > 1000;

  const onPay = React.useCallback(async () => {
    if (!jwt) {
      setPayError("Not authenticated");
      return;
    }
    if (amountInvalid) {
      setPayError("Enter a valid top-up amount.");
      return;
    }

    setBusy(true);
    setPayError(null);
    try {
      rememberPostPaygSuccessNavigate(postPayModelPath);
      const result = await atomicBackendApi.createPaygTopup(jwt, {
        amountUsd,
        successUrl: getStripePaygSuccessUrl(),
        cancelUrl: STRIPE_PAYG_CANCEL_URL,
      });
      openExternal(result.checkoutUrl);
      dispatch(atomicAuthActions.setTopupPending(true));
    } catch (err) {
      clearPostPaygSuccessNavigate();
      setPayError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [jwt, dispatch, postPayModelPath, amountUsd, amountInvalid]);

  const dismissPending = React.useCallback(() => {
    clearPostPaygSuccessNavigate();
    dispatch(atomicAuthActions.setTopupPending(false));
  }, [dispatch]);

  if (topupPending) {
    return (
      <>
        <OnboardingHeader
          totalSteps={ATOMIC_PAYG_FLOW.totalSteps}
          activeStep={ATOMIC_PAYG_FLOW.steps.topup}
          onBack={dismissPending}
          onSkip={ctx.skip}
        />
        <GlassCard className={s.shell}>
          <div className={s.pending}>
            <span className="UiButtonSpinner" aria-hidden="true" />
            <div className={s.pendingTitle}>Waiting for payment...</div>
            <div className={s.pendingHint}>
              Complete the checkout in your browser, then return here.
            </div>
            <div className={s.pendingBack}>
              <SecondaryButton size="sm" onClick={dismissPending}>
                Back
              </SecondaryButton>
            </div>
          </div>
        </GlassCard>
      </>
    );
  }

  return (
    <>
      <OnboardingHeader
        totalSteps={ATOMIC_PAYG_FLOW.totalSteps}
        activeStep={ATOMIC_PAYG_FLOW.steps.topup}
        onBack={() => void navigate("../setup-mode", { relative: "path" })}
        onSkip={() => {
          clearPostPaygSuccessNavigate();
          void navigate("../atomic-model", { relative: "path" });
        }}
      />

      <GlassCard className={s.shell}>
        <div className="UiSectionContent">
          <div className={s.title}>
            <span className={s.titlePlain}>Power up your </span>
            <span className={s.titleAccent}>Atomic</span>
            <span className={s.titlePlain}> credits</span>
          </div>

          <div className={s.card}>
            <div className={s.cardInner}>
              <div className={s.priceRow}>
                <span className={s.price}>Choose amount</span>
                <span className={s.priceSuffix}>one-time top-up</span>
              </div>

              <div className={s.amountSection}>
                <label htmlFor="atomic-topup-amount" className={s.amountLabel}>
                  Top-up amount (USD)
                </label>
                <div className={s.amountInputWrap}>
                  <span className={s.amountPrefix}>$</span>
                  <input
                    id="atomic-topup-amount"
                    className={s.amountInput}
                    inputMode="decimal"
                    autoComplete="off"
                    value={amountInput}
                    onChange={(e) => {
                      setAmountInput(e.target.value);
                      if (payError) setPayError(null);
                    }}
                    placeholder="10"
                    aria-invalid={amountInvalid}
                  />
                </div>
                <div className={s.amountHint}>
                  Pay only for what you want to add. You can top up again
                  anytime.
                </div>
              </div>

              <ul className={s.featureList}>
                {FEATURES.map((feature, i) => (
                  <li key={i} className={s.featureItem}>
                    <CheckIcon />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className={s.footer}>
                <div className={s.buttonWrap}>
                  <PrimaryButton
                    disabled={busy || !jwt || amountInvalid}
                    loading={busy}
                    onClick={() => void onPay()}
                  >
                    Continue to payment
                  </PrimaryButton>
                </div>

                <div className={s.trialNote}>
                  One-time top-up. No subscription, no commitments.
                </div>
              </div>
            </div>
          </div>

          {!jwt && (
            <div style={{ marginTop: 12 }}>
              <InlineError>
                Not signed in — go back and sign in with Google.
              </InlineError>
            </div>
          )}
          {payError && <InlineError>{payError}</InlineError>}
        </div>
      </GlassCard>
    </>
  );
}
