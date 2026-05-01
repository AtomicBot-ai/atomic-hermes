import React from "react";
import { PrimaryButton } from "@shared/kit";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { fetchAtomicBalance } from "@store/slices/atomicAuthSlice";
import { PaygTopUpDialog } from "./PaygTopUpDialog";
import s from "./AtomicBalanceWidget.module.css";

function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

export function AtomicBalanceWidget(props: { onTopUpClick?: () => void }) {
  const dispatch = useAppDispatch();
  const balance = useAppSelector((state) => state.atomicAuth.balance);
  const loading = useAppSelector((state) => state.atomicAuth.balanceLoading);
  const error = useAppSelector((state) => state.atomicAuth.balanceError);
  const jwt = useAppSelector((state) => state.atomicAuth.jwt);

  const [topupOpen, setTopupOpen] = React.useState(false);

  React.useEffect(() => {
    if (jwt && !balance && !loading) {
      void dispatch(fetchAtomicBalance({}));
    }
  }, [jwt, balance, loading, dispatch]);

  const handleTopUp = React.useCallback(() => {
    if (props.onTopUpClick) {
      props.onTopUpClick();
      return;
    }
    setTopupOpen(true);
  }, [props]);

  if (!jwt) return null;

  return (
    <div className={s.widget}>
      <div className={s.row}>
        <span className={s.label}>PAYG balance</span>
        <span className={s.value}>{formatUsd(balance?.payg?.remaining ?? null)}</span>
      </div>
      {balance?.subscription && (
        <div className={s.row}>
          <span className={s.label}>Pay as you go credits</span>
          <span className={s.value}>{formatUsd(balance.subscription.remaining)}</span>
        </div>
      )}
      {error && <div className={s.error}>{error}</div>}
      <div className={s.actions}>
        <PrimaryButton size="sm" onClick={handleTopUp}>
          Top up
        </PrimaryButton>
        <button
          type="button"
          className={s.refresh}
          onClick={() => void dispatch(fetchAtomicBalance({ sync: true }))}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <PaygTopUpDialog open={topupOpen} onClose={() => setTopupOpen(false)} />
    </div>
  );
}
