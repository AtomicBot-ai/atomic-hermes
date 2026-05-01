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
import {
  atomicAuthActions,
  clearAtomicAuthThunk,
} from "@store/slices/atomicAuthSlice";
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

const DEFAULT_TOPUP_AMOUNT_USD = 25;

const FEATURES = [
  "Credits never expire",
  "Top up anytime, no subscription",
  "Access to 1000+ AI models",
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

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.333 7V5.667a2.667 2.667 0 1 1 5.334 0V7M4.667 7h6.666c.737 0 1.334.597 1.334 1.333v4c0 .737-.597 1.334-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334v-4c0-.736.597-1.333 1.334-1.333Z"
        stroke="currentColor"
        strokeWidth="1.333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

  const isPending = topupPending || busy;

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

  return (
    <>
      <OnboardingHeader
        totalSteps={ATOMIC_PAYG_FLOW.totalSteps}
        activeStep={ATOMIC_PAYG_FLOW.steps.topup}
        onBack={() => {
          ctx.setSetupFlow("unset");
          dispatch(clearAtomicAuthThunk());
          clearPostPaygSuccessNavigate();
          void navigate("../setup-mode", { relative: "path" });
        }}
        onSkip={() => {
          clearPostPaygSuccessNavigate();
          void navigate("../atomic-model", { relative: "path" });
        }}
      />

      <GlassCard className={s.shell}>
        <div className="UiSectionContent">
          <div className={s.title}>
            <span className={s.titlePlain}>Power up your </span>
            <span className={s.titleAccent}>agent</span>
          </div>

          <div className={s.card}>
            <div className={s.cardInner}>
              <div className={s.sectionTitle}>Enter amount</div>

              <div className={s.amountInputWrap}>
                <span className={s.amountPrefix}>$</span>
                <input
                  id="atomic-topup-amount"
                  className={s.amountInput}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={amountInput}
                  disabled={isPending}
                  onChange={(e) => {
                    const digitsOnly = e.target.value
                      .replace(/\D+/g, "")
                      .slice(0, 4);
                    setAmountInput(digitsOnly);
                    if (payError) setPayError(null);
                  }}
                  placeholder="25"
                  aria-invalid={amountInvalid}
                />
              </div>

              <div className={s.divider} />

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
                    disabled={!jwt || amountInvalid || isPending}
                    loading={busy}
                    onClick={() => void onPay()}
                  >
                    {topupPending
                      ? "Waiting for payment..."
                      : "Continue to payment"}
                  </PrimaryButton>
                </div>

                <div className={s.secureNote}>
                  {topupPending ? (
                    <div className={s.pendingNoteBlock}>
                      <span>
                        Complete payment in your browser, then return here.
                      </span>
                      <button
                        type="button"
                        className={s.pendingDismissBtn}
                        onClick={dismissPending}
                      >
                        Cancel and change amount
                      </button>
                    </div>
                  ) : (
                    <>
                      <LockIcon />
                      <span>Secure payment via Stripe</span>
                    </>
                  )}
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
