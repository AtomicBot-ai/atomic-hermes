import React from "react";
import {
  InlineError,
  Modal,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@shared/kit";
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

const PRESET_AMOUNTS_USD = [5, 10, 25, 50];

function openExternal(url: string): void {
  const api = (window as { hermesAPI?: { openExternal?: (u: string) => void } })
    .hermesAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, "_blank");
}

export function PaygTopUpDialog(props: {
  open: boolean;
  onClose: () => void;
  initialAmountUsd?: number;
}) {
  const dispatch = useAppDispatch();
  const jwt = useAppSelector((state) => state.atomicAuth.jwt);
  const topupBusy = useAppSelector((state) => state.atomicAuth.topupBusy);
  const topupError = useAppSelector((state) => state.atomicAuth.topupError);
  const topupPending = useAppSelector((state) => state.atomicAuth.topupPending);

  const [amount, setAmount] = React.useState<string>(
    String(props.initialAmountUsd ?? 10),
  );
  const [localError, setLocalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (props.open) {
      setAmount(String(props.initialAmountUsd ?? 10));
      setLocalError(null);
      dispatch(atomicAuthActions.setTopupError(null));
    }
  }, [props.open, props.initialAmountUsd, dispatch]);

  const parsedAmount = Number.parseFloat(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 1;

  const startCheckout = React.useCallback(async () => {
    if (!jwt) {
      setLocalError("Not signed in");
      return;
    }
    if (!amountValid) {
      setLocalError("Enter at least $1");
      return;
    }
    setLocalError(null);
    dispatch(atomicAuthActions.setTopupBusy(true));
    dispatch(atomicAuthActions.setTopupError(null));
    try {
      const { checkoutUrl } = await atomicBackendApi.createPaygTopup(jwt, {
        amountUsd: parsedAmount,
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
  }, [jwt, amount, amountValid, parsedAmount, dispatch]);

  const refreshBalance = React.useCallback(() => {
    void dispatch(fetchAtomicBalance({ sync: true }));
  }, [dispatch]);

  const errorMessage = localError ?? topupError;

  return (
    <Modal open={props.open} onClose={props.onClose} header="Top up Atomic credits">
      <p style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
        Add credits to your pay-as-you-go pool. We&rsquo;ll open Stripe Checkout
        in your browser; come back here when payment is complete.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {PRESET_AMOUNTS_USD.map((preset) => (
          <SecondaryButton
            key={preset}
            size="sm"
            onClick={() => setAmount(String(preset))}
          >
            ${preset}
          </SecondaryButton>
        ))}
      </div>

      <TextInput
        label="Amount (USD)"
        value={amount}
        onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
        placeholder="10"
      />

      {errorMessage && <InlineError>{errorMessage}</InlineError>}

      {topupPending && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          Waiting for payment to complete in your browser&hellip;
          <button
            type="button"
            style={{
              marginLeft: 8,
              background: "none",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
              color: "inherit",
            }}
            onClick={refreshBalance}
          >
            Refresh balance
          </button>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <SecondaryButton size="sm" onClick={props.onClose}>
          Close
        </SecondaryButton>
        <PrimaryButton
          size="sm"
          loading={topupBusy}
          disabled={!amountValid || topupBusy || !jwt}
          onClick={() => void startCheckout()}
        >
          Open Stripe Checkout
        </PrimaryButton>
      </div>
    </Modal>
  );
}
