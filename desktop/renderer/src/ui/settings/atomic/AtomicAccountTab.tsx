import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  atomicAuthActions,
  clearAtomicAuthThunk,
  fetchAtomicBalance,
} from "@store/slices/atomicAuthSlice";
import { clearAtomicPaygBackup } from "@store/slices/auth/mode-backups";
import { patchConfig } from "../../../services/api";
import {
  STRIPE_PAYG_CANCEL_URL,
  atomicBackendApi,
  getStripePaygSuccessUrl,
} from "../../../services/atomic-backend-api";
import s from "./AtomicAccountTab.module.css";

const DEPLETED_THRESHOLD_USD = 0.05;
const DEFAULT_TOPUP_USD = "10.00";

function openExternal(url: string): void {
  const api = (window as { hermesAPI?: { openExternal?: (u: string) => void } }).hermesAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, "_blank");
}

function formatDollars(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "$0.00";
  return `$${value.toFixed(2)}`;
}

function LogOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AtomicAccountTab(props: { port: number }) {
  const dispatch = useAppDispatch();

  const jwt = useAppSelector((state) => state.atomicAuth.jwt);
  const email = useAppSelector((state) => state.atomicAuth.email);
  const balance = useAppSelector((state) => state.atomicAuth.balance);
  const balanceLoading = useAppSelector((state) => state.atomicAuth.balanceLoading);
  const balanceError = useAppSelector((state) => state.atomicAuth.balanceError);
  const topupBusy = useAppSelector((state) => state.atomicAuth.topupBusy);
  const topupError = useAppSelector((state) => state.atomicAuth.topupError);
  const topupPending = useAppSelector((state) => state.atomicAuth.topupPending);

  const [topUpAmount, setTopUpAmount] = React.useState(DEFAULT_TOPUP_USD);

  // Refresh balance on tab open. Single-shot per mount; matches openclaw behavior.
  React.useEffect(() => {
    if (jwt) {
      void dispatch(fetchAtomicBalance({ sync: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remaining = balance?.payg?.remaining;
  const balanceDepleted =
    balance !== null && remaining != null && remaining <= DEPLETED_THRESHOLD_USD;

  const handleTopUp = React.useCallback(async () => {
    if (!jwt) return;
    const amount = Number.parseFloat(topUpAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      dispatch(atomicAuthActions.setTopupError("Enter at least $1"));
      return;
    }
    dispatch(atomicAuthActions.setTopupBusy(true));
    dispatch(atomicAuthActions.setTopupError(null));
    try {
      const { checkoutUrl } = await atomicBackendApi.createPaygTopup(jwt, {
        amountUsd: amount,
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
  }, [jwt, topUpAmount, dispatch]);

  const refreshBalance = React.useCallback(() => {
    void dispatch(fetchAtomicBalance({ sync: true }));
  }, [dispatch]);

  const signOut = React.useCallback(async () => {
    await dispatch(clearAtomicAuthThunk()).unwrap();
    clearAtomicPaygBackup();
    try {
      await patchConfig(props.port, {
        env: { OPENROUTER_API_KEY: "" },
      });
    } catch (err) {
      console.warn("[AtomicAccountTab] clearing OPENROUTER_API_KEY failed:", err);
    }
  }, [dispatch, props.port]);

  const heroAmount = balanceDepleted ? "$0" : formatDollars(remaining);
  const errorMessage = balanceError ?? topupError;

  return (
    <div className={s.root}>
      <div className={`${s.balanceCard} glass-effect`}>
        <div className={s.balanceHeader}>
          <h3 className={s.balanceTitle}>Balance</h3>
        </div>

        <div className={s.balanceHero}>
          <span
            className={`${s.balanceAmount}${balanceDepleted ? ` ${s["balanceAmount--depleted"]}` : ""}`}
          >
            {heroAmount}
          </span>
          <div className={s.balanceRow}>
            {balanceLoading ? (
              <span className={s.balancePollingHint}>
                <span className={s.balancePollingSpinner} aria-hidden="true" />
                Updating...
              </span>
            ) : (
              <span className={s.balanceLabel}>Remaining credits</span>
            )}
          </div>
        </div>

        {balanceDepleted && (
          <div className={s.depletedCard}>
            <div className={s.depletedBody}>
              <div className={s.depletedTitle}>No credits left</div>
              <div className={s.depletedSubtitle}>Top up to continue using AI.</div>
            </div>
            <button
              type="button"
              className={s.depletedAction}
              onClick={() => void handleTopUp()}
              disabled={topupBusy}
            >
              {topupBusy ? "Opening…" : "Top up"}
            </button>
          </div>
        )}

        {errorMessage && <div className={s.errorRow}>{errorMessage}</div>}
      </div>

      <div className={s.topUpSection}>
        <h3 className={s.topUpTitle}>One-Time Top-Up</h3>
        <div className={s.topUpRow}>
          <div className={s.topUpInputWrap}>
            <span className={s.topUpCurrency}>$</span>
            <input
              type="number"
              className={s.topUpInput}
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              min={1}
              step={1}
              aria-label="Top-up amount in USD"
            />
          </div>
          <button
            type="button"
            className={s.topUpButton}
            onClick={() => void handleTopUp()}
            disabled={topupBusy || !jwt}
          >
            {topupBusy ? "Opening…" : "Top Up"}
          </button>
        </div>
        {topupPending && (
          <div className={s.topUpPendingRow}>
            Waiting for payment to complete in your browser…
            <button type="button" className={s.topUpPendingAction} onClick={refreshBalance}>
              Refresh balance
            </button>
          </div>
        )}
      </div>

      {jwt && (
        <div className={s.accountFooter}>
          <div className={s.accountAvatar}>
            {email ? email.charAt(0).toUpperCase() : "?"}
          </div>
          <span className={s.accountEmail}>{email || "—"}</span>
          <button
            type="button"
            className={s.logoutBtn}
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOutIcon />
          </button>
        </div>
      )}
    </div>
  );
}
