import React from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  atomicAuthActions,
  fetchAtomicBalance,
} from "@store/slices/atomicAuthSlice";

/**
 * After a Stripe Checkout returns, the desktop app cannot rely on a
 * `atomicbot-hermes://stripe-success` deep link to fire — Stripe rewrites
 * unknown URI schemes (DNS error in the user's browser). Instead we poll
 * the balance endpoint until the new credits land, mirroring the openclaw
 * `usePaidStatusBridge` pattern.
 *
 * Total budget ≈ 2 minutes:
 *   - 30 polls × 2s = first minute
 *   - 12 polls × 5s = second minute
 * If the balance increases versus the pre-topup snapshot, we stop early
 * and notify the user. Otherwise the periodic background refresh (e.g.
 * window focus) eventually picks the new balance up.
 */
const TOPUP_POLL_DELAYS_MS = [
  ...Array<number>(30).fill(2000),
  ...Array<number>(12).fill(5000),
];

export function useAtomicTopupPolling(): void {
  const dispatch = useAppDispatch();
  const jwt = useAppSelector((state) => state.atomicAuth.jwt);
  const topupPending = useAppSelector((state) => state.atomicAuth.topupPending);
  const balance = useAppSelector((state) => state.atomicAuth.balance);

  const balanceRef = React.useRef(balance);
  React.useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  // ── Polling: triggered by `topupPending` going truthy ──
  React.useEffect(() => {
    if (!topupPending || !jwt) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const previousRemaining = balanceRef.current?.payg?.remaining ?? null;

    void (async () => {
      for (const delay of TOPUP_POLL_DELAYS_MS) {
        if (cancelled) return;
        await new Promise<void>((resolve) => {
          pollTimer = setTimeout(resolve, delay);
        });
        if (cancelled) return;

        // External refresh (focus/visibility) may have already updated the
        // balance — short-circuit in that case.
        const current = balanceRef.current?.payg?.remaining ?? null;
        if (
          previousRemaining !== null &&
          current !== null &&
          current > previousRemaining
        ) {
          toast.success("Balance updated");
          dispatch(atomicAuthActions.setTopupPending(false));
          return;
        }

        try {
          const result = await dispatch(
            fetchAtomicBalance({ sync: true }),
          ).unwrap();
          const newRemaining = result.payg?.remaining ?? null;
          if (
            newRemaining !== null &&
            (previousRemaining === null || newRemaining > previousRemaining)
          ) {
            toast.success("Balance updated");
            dispatch(atomicAuthActions.setTopupPending(false));
            return;
          }
        } catch {
          // Transient — keep retrying.
        }
      }
      // Stripe webhook is sometimes slower than our polling budget. The
      // balance will land on the next manual / focus-triggered refresh.
      toast("Balance is being updated…");
      dispatch(atomicAuthActions.setTopupPending(false));
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [topupPending, jwt, dispatch]);

  // ── Window focus / visibility refresh ──
  // Fires whenever the user comes back to the app, e.g. after switching to
  // the browser to complete Stripe Checkout. Independent of `topupPending`
  // so a manual return (without our explicit flow) still resyncs.
  React.useEffect(() => {
    if (!jwt) return;

    const refresh = () => {
      void dispatch(fetchAtomicBalance({ sync: true }));
    };

    const onFocus = () => refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [jwt, dispatch]);
}
