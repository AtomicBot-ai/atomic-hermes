import React from "react";

import { errorToMessage } from "@lib/error-format";
import { ConfirmDialog } from "@shared/kit";
import s from "../OtherTab.module.css";

function getHermesAPI(): any {
  return typeof window !== "undefined" ? (window as any).hermesAPI : null;
}

export function DangerZoneSection({ onError }: { onError: (msg: string | null) => void }) {
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);

  const confirmResetAndClose = React.useCallback(async () => {
    setResetConfirmOpen(false);
    const api = getHermesAPI();
    if (!api?.resetAndClose) {
      onError("Reset is not available — not running inside Electron");
      return;
    }
    onError(null);
    setResetBusy(true);
    try {
      await api.resetAndClose();
    } catch (err) {
      onError(errorToMessage(err));
      setResetBusy(false);
    }
  }, [onError]);

  return (
    <>
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Account</h3>
        <p className={s.UiSettingsOtherDangerSubtitle}>
          This will wipe the app&apos;s local state and restart. You will need to set it up again.
        </p>
        <div className={`${s.UiSettingsOtherCard} ${s["UiSettingsOtherCard--danger"]}`}>
          <div className={s.UiSettingsOtherRow}>
            <button
              type="button"
              className={s.UiSettingsOtherDangerButton}
              disabled={resetBusy}
              onClick={() => setResetConfirmOpen(true)}
            >
              {resetBusy ? "Resetting..." : "Reset and sign out"}
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset and sign out?"
        subtitle="All local data will be deleted. The app will close and you'll need to set it up again."
        confirmLabel="Reset"
        danger
        onConfirm={() => void confirmResetAndClose()}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </>
  );
}
