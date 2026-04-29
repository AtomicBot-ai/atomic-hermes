import React from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard, InlineError, PrimaryButton } from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  applyPaygKey,
  storeAtomicToken,
} from "@store/slices/atomicAuthSlice";
import { setMode } from "@store/slices/configSlice";
import { persistMode } from "@store/slices/mode-persistence";
import { OnboardingHeader } from "../OnboardingHeader";
import { useSetup } from "../setup-context";
import { ATOMIC_PAYG_FLOW } from "../onboarding-steps";
import { googleAuthDesktopUrl } from "../../../services/atomic-backend-api";
import { useAtomicDeepLink } from "../../../hooks/useAtomicDeepLink";
import s from "./AtomicSignInPage.module.css";

function openExternal(url: string): void {
  const api = (window as { hermesAPI?: { openExternal?: (u: string) => void } })
    .hermesAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, "_blank");
}

// `createAsyncThunk` rethrows non-`rejectWithValue` errors as a SerializedError
// plain object (`{ name, message, stack }`), not an `Error` instance. A naive
// `String(err)` then collapses to "[object Object]". This helper extracts a
// human-readable message from the common shapes we may receive here.
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const candidate = (err as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return "Unexpected error";
}

type Phase = "idle" | "waiting" | "authenticated" | "applying" | "ready" | "error";

export function AtomicSignInPage() {
  useOnboardingStepEvent("atomic_sign_in", "atomic-payg");
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const ctx = useSetup();

  const jwt = useAppSelector((state) => state.atomicAuth.jwt);
  const email = useAppSelector((state) => state.atomicAuth.email);
  const applyKeyBusy = useAppSelector((state) => state.atomicAuth.applyKeyBusy);
  const applyKeyError = useAppSelector((state) => state.atomicAuth.applyKeyError);

  const [phase, setPhase] = React.useState<Phase>(jwt ? "authenticated" : "idle");
  const [localError, setLocalError] = React.useState<string | null>(null);
  // After applyPaygKey resolves we know the user's PAYG remaining balance;
  // when it's positive we skip the top-up screen and go straight to model select.
  const [hasExistingCredits, setHasExistingCredits] = React.useState(false);

  const startSignIn = React.useCallback(() => {
    setLocalError(null);
    setPhase("waiting");
    const url = googleAuthDesktopUrl();
    openExternal(url);
  }, []);

  useAtomicDeepLink({
    onAuth: (params) => {
      void (async () => {
        try {
          await dispatch(
            storeAtomicToken({
              jwt: params.jwt,
              email: params.email,
              userId: params.userId,
              isNewUser: params.isNewUser,
            }),
          ).unwrap();
          setPhase("authenticated");
        } catch (err) {
          console.error("[AtomicSignInPage] storeAtomicToken failed:", err);
          setLocalError(describeError(err));
          setPhase("error");
        }
      })();
    },
    onAuthError: () => {
      setLocalError("Authentication failed — missing token data");
      setPhase("error");
    },
  });

  // Once we have a JWT, fetch the PAYG key and push it into the local
  // gateway via patchConfig. Runs once per `jwt` value to avoid loops.
  const appliedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!jwt || phase !== "authenticated") return;
    if (appliedRef.current === jwt) return;
    appliedRef.current = jwt;

    setPhase("applying");
    void (async () => {
      try {
        const result = await dispatch(applyPaygKey({ port: ctx.port })).unwrap();
        ctx.setSelectedProvider("openrouter");
        dispatch(setMode("atomic-payg"));
        persistMode("atomic-payg");
        setHasExistingCredits(result.remaining > 0);
        setPhase("ready");
      } catch (err) {
        console.error("[AtomicSignInPage] applyPaygKey failed:", err);
        setLocalError(describeError(err));
        setPhase("error");
      }
    })();
  }, [jwt, phase, dispatch, ctx]);

  React.useEffect(() => {
    if (phase !== "ready") return;
    const target = hasExistingCredits ? "../atomic-model" : "../atomic-topup";
    void navigate(target, { relative: "path" });
  }, [phase, hasExistingCredits, navigate]);

  const errorMessage = localError ?? applyKeyError ?? null;
  const showSpinner = phase === "waiting" || phase === "applying" || applyKeyBusy;

  return (
    <>
      <OnboardingHeader
        totalSteps={ATOMIC_PAYG_FLOW.totalSteps}
        activeStep={ATOMIC_PAYG_FLOW.steps.signIn}
        onBack={() => void navigate("../setup-mode", { relative: "path" })}
        onSkip={ctx.skip}
      />
      <GlassCard className={s.card}>
        <div className="UiSectionContent">
          <div>
            <div className="UiSectionTitle">Sign in with Atomic</div>
            <div className="UiSectionSubtitle">
              We&rsquo;ll open your browser to finish Google sign-in. Pay-as-you-go
              credits start at zero — top up only when you need to.
            </div>
          </div>

          <ul className={s.bullets}>
            <li>Google sign-in (no passwords stored on your machine)</li>
            <li>OpenRouter models powered by Atomic credits</li>
            <li>Manage billing and credits anytime in settings</li>
          </ul>

          {phase === "waiting" && (
            <div className={s.status}>
              <span className={s.spinner} aria-hidden="true" />
              <span>Waiting for Google sign-in&hellip;</span>
            </div>
          )}

          {phase === "applying" && (
            <div className={s.status}>
              <span className={s.spinner} aria-hidden="true" />
              <span>
                Configuring OpenRouter via your Atomic account
                {email ? ` (${email})` : ""}&hellip;
              </span>
            </div>
          )}

          {phase === "authenticated" && (
            <div className={s.status}>
              <span className={s.dotReady} aria-hidden="true" />
              <span>Signed in{email ? ` as ${email}` : ""}.</span>
            </div>
          )}

          {errorMessage && <InlineError>{errorMessage}</InlineError>}
        </div>

        <div className={s.footer}>
          <PrimaryButton
            size="sm"
            loading={showSpinner}
            disabled={showSpinner}
            onClick={startSignIn}
          >
            {phase === "error" ? "Try again" : "Continue with Google"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </>
  );
}
