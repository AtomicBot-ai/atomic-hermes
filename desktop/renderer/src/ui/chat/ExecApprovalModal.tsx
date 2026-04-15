import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { approvalResolved, type PendingApproval } from "@store/slices/chatSlice";
import { resolveApproval, type ApprovalDecision } from "../../services/approval-api";
import s from "./ExecApprovalModal.module.css";

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <div className={s.ExecApprovalMetaRow}>
      <span className={s.ExecApprovalMetaLabel}>{label}</span>
      <span className={s.ExecApprovalMetaValue}>{value}</span>
    </div>
  );
}

function ExecApprovalCard({
  approval,
  port,
  busy,
  error,
  onDecision,
  onDismiss,
}: {
  approval: PendingApproval;
  port: number;
  busy: boolean;
  error: string | null;
  onDecision: (d: ApprovalDecision) => void;
  onDismiss: () => void;
}) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  return (
    <div
      className={`UiModalOverlay ${s.ExecApprovalOverlay}`}
      role="dialog"
      aria-modal="true"
      aria-label="Exec approval needed"
    >
      <div className={`UiModalCard ${s.ExecApprovalCard}`}>
        {/* Header */}
        <div className={s.ExecApprovalHeader}>
          <div>
            <div className={s.ExecApprovalTitle}>Exec approval needed</div>
            <div className={s.ExecApprovalSub}>Waiting for your decision</div>
          </div>
          <div className={s.ExecApprovalHeaderRight}>
            <button
              className={s.ExecApprovalCloseBtn}
              onClick={onDismiss}
              aria-label="Close"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M11 3L3 11M3 3l8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className={s.ExecApprovalBody}>
          <div className={s.ExecApprovalCommand}>{approval.command}</div>

          <div className={s.ExecApprovalMeta}>
            <MetaRow label="Warning" value={approval.description} />
            <MetaRow label="Session" value={approval.sessionId} />
          </div>

          {error && <div className={s.ExecApprovalError}>{error}</div>}
        </div>

        {/* Actions */}
        <div className={s.ExecApprovalActions}>
          <button
            className="UiActionButton UiActionButton-primary"
            disabled={busy}
            onClick={() => onDecision("allow-once")}
          >
            Allow once
          </button>
          <button
            className="UiActionButton"
            disabled={busy}
            onClick={() => onDecision("allow-always")}
          >
            Always allow
          </button>
          <button
            className={`UiActionButton ${s.ExecApprovalDenyBtn}`}
            disabled={busy}
            onClick={() => onDecision("deny")}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExecApprovalModal() {
  const dispatch = useAppDispatch();
  const approval = useAppSelector((st) => st.chat.pendingApproval);
  const gatewayState = useAppSelector((st) => st.gateway.state);
  const port = gatewayState?.kind === "ready" ? gatewayState.port : 8642;

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setBusy(false);
    setError(null);
  }, [approval]);

  if (!approval) {
    return null;
  }

  const handleDecision = async (decision: ApprovalDecision) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await resolveApproval(port, approval.sessionId, decision);
      dispatch(approvalResolved());
    } catch (err) {
      setError(
        `Exec approval failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    void handleDecision("deny");
  };

  return (
    <ExecApprovalCard
      approval={approval}
      port={port}
      busy={busy}
      error={error}
      onDecision={handleDecision}
      onDismiss={handleDismiss}
    />
  );
}
