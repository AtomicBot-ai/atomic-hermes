import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  atomicAuthActions,
  fetchAtomicBalance,
} from "@store/slices/atomicAuthSlice";
import {
  STRIPE_PAYG_CANCEL_URL,
  atomicBackendApi,
  getStripePaygSuccessUrl,
} from "../../../services/atomic-backend-api";
import s from "./LowBalanceBanner.module.css";

const DEFAULT_THRESHOLD_USD = 1;
const SESSION_DISMISS_KEY = "hermes:low-balance-banner-dismissed";
const DEFAULT_TOPUP_USD = 10;

function openExternal(url: string): void {
  const api = (window as { hermesAPI?: { openExternal?: (u: string) => void } }).hermesAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, "_blank");
}

function EmptyWalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 7v4m0 2.5h.008M4.34 17h11.32c1.34 0 2.18-1.45 1.51-2.606L11.51 3.606a1.745 1.745 0 00-3.02 0L2.83 14.394C2.16 15.55 3 17 4.34 17z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 1l8 8M9 1l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Floating pill-shaped banner shown when the user's PAYG pool drops below
 * `thresholdUsd`. Only visible in atomic-payg mode. Dismiss is per-session
 * (sessionStorage), reappears on next app launch if balance is still low.
 */
export function LowBalanceBanner(props: { thresholdUsd?: number }) {
  const dispatch = useAppDispatch();
  const jwt = useAppSelector((state) => state.atomicAuth.jwt);
  const mode = useAppSelector((state) => state.config.mode);
  const balance = useAppSelector((state) => state.atomicAuth.balance);

  const [dismissed, setDismissed] = React.useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    if (jwt && mode === "atomic-payg" && !balance) {
      void dispatch(fetchAtomicBalance({}));
    }
  }, [jwt, mode, balance, dispatch]);

  const handleTopUp = React.useCallback(async () => {
    if (!jwt) return;
    dispatch(atomicAuthActions.setTopupBusy(true));
    dispatch(atomicAuthActions.setTopupError(null));
    try {
      const { checkoutUrl } = await atomicBackendApi.createPaygTopup(jwt, {
        amountUsd: DEFAULT_TOPUP_USD,
        successUrl: getStripePaygSuccessUrl(),
        cancelUrl: STRIPE_PAYG_CANCEL_URL,
      });
      openExternal(checkoutUrl);
      dispatch(atomicAuthActions.setTopupPending(true));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch(atomicAuthActions.setTopupError(msg));
    } finally {
      dispatch(atomicAuthActions.setTopupBusy(false));
    }
  }, [jwt, dispatch]);

  const handleDismiss = React.useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      /* sessionStorage unavailable */
    }
    setDismissed(true);
  }, []);

  if (mode !== "atomic-payg" || !jwt || dismissed) return null;
  const remaining = balance?.payg?.remaining;
  if (remaining == null) return null;

  const threshold = props.thresholdUsd ?? DEFAULT_THRESHOLD_USD;
  if (remaining > threshold) return null;

  return (
    <div className={s.banner} role="status" aria-live="polite">
      <div className={s.icon}>
        <EmptyWalletIcon />
      </div>
      <div className={s.body}>
        <div className={s.title}>No credits left</div>
        <div className={s.subtitle}>Top up to continue using AI.</div>
      </div>
      <button
        type="button"
        className={s.action}
        onClick={() => void handleTopUp()}
      >
        Top up
      </button>
      <button
        type="button"
        className={s.dismiss}
        onClick={handleDismiss}
        aria-label="Dismiss banner"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
