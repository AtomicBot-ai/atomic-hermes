import React from "react";
import { InlineError, SplashLogo } from "@shared/kit";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  applyPaygKey,
  storeAtomicToken,
} from "@store/slices/atomicAuthSlice";
import { googleAuthDesktopUrl } from "../../../services/atomic-backend-api";
import { useAtomicDeepLink } from "../../../hooks/useAtomicDeepLink";
import s from "./AtomicSignInPrompt.module.css";

const GOOGLE_ICON = new URL(
  "../../../../../assets/set-up-skills/Google.svg",
  import.meta.url,
).toString();

type Phase = "idle" | "waiting" | "authenticated" | "applying" | "error";

function openExternal(url: string): void {
  const api = (window as { hermesAPI?: { openExternal?: (u: string) => void } })
    .hermesAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, "_blank");
}

// `createAsyncThunk` rethrows non-`rejectWithValue` errors as a plain
// `SerializedError` object, not an `Error` instance — collapse to a string.
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const candidate = (err as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return "Unexpected error";
}

export function AtomicSignInPrompt(props: {
  port: number;
  title?: string;
  hint?: string;
}) {
  const dispatch = useAppDispatch();
  const jwt = useAppSelector((state) => state.atomicAuth.jwt);
  const applyKeyBusy = useAppSelector((state) => state.atomicAuth.applyKeyBusy);
  const applyKeyError = useAppSelector(
    (state) => state.atomicAuth.applyKeyError,
  );

  const [phase, setPhase] = React.useState<Phase>(jwt ? "authenticated" : "idle");
  const [localError, setLocalError] = React.useState<string | null>(null);

  const title = props.title ?? "Sign in with Atomic";
  const hint = props.hint ?? "Use OpenRouter on a pay-as-you-go plan.";

  const startSignIn = React.useCallback(() => {
    setLocalError(null);
    setPhase("waiting");
    openExternal(googleAuthDesktopUrl());
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
          console.error("[AtomicSignInPrompt] storeAtomicToken failed:", err);
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

  // Once we have a JWT, push the PAYG key into the local gateway. Runs once
  // per `jwt` value to avoid loops.
  const appliedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!jwt || phase !== "authenticated") return;
    if (appliedRef.current === jwt) return;
    appliedRef.current = jwt;

    setPhase("applying");
    void (async () => {
      try {
        await dispatch(applyPaygKey({ port: props.port })).unwrap();
        setPhase("idle");
      } catch (err) {
        console.error("[AtomicSignInPrompt] applyPaygKey failed:", err);
        setLocalError(describeError(err));
        setPhase("error");
      }
    })();
  }, [jwt, phase, dispatch, props.port]);

  const errorMessage = localError ?? applyKeyError ?? null;
  const showSpinner =
    phase === "waiting" || phase === "applying" || applyKeyBusy;

  return (
    <div className={s.root}>
      <div className={s.signUpCard}>
        <div className={s.signUpIcon}>
          <SplashLogo iconAlt="Atomic Hermes" size={28} />
        </div>

        <div className={s.signUpBody}>
          <h3 className={s.signUpTitle}>{title}</h3>
          <p className={s.signUpHint}>{hint}</p>
          {errorMessage ? (
            <div className={s.errorRow}>
              <InlineError>{errorMessage}</InlineError>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={s.signUpButton}
          onClick={startSignIn}
          disabled={showSpinner}
          aria-busy={showSpinner}
        >
          {showSpinner ? (
            <>
              <span className={s.buttonSpinner} aria-hidden="true" />
              <span>
                {phase === "applying" ? "Configuring…" : "Waiting…"}
              </span>
            </>
          ) : (
            <>
              <img
                src={GOOGLE_ICON}
                alt=""
                aria-hidden="true"
                width={16}
                height={16}
                className={s.googleIcon}
              />
              <span>
                {phase === "error" ? "Try again" : "Continue with Google"}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
