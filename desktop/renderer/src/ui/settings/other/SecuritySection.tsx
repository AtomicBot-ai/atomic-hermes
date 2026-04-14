import React from "react";

import type { SecurityLevel } from "./types";
import s from "../OtherTab.module.css";

export function SecuritySection({ onError }: { onError: (msg: string | null) => void }) {
  const [securityLevel, setSecurityLevel] = React.useState<SecurityLevel>("balanced");
  const [securityBusy, setSecurityBusy] = React.useState(false);

  const handleSecurityLevelChange = React.useCallback(
    async (level: SecurityLevel) => {
      const prev = securityLevel;
      setSecurityLevel(level);
      setSecurityBusy(true);
      onError(null);
      try {
        // TODO: wire gateway RPC (exec.approvals.get / exec.approvals.set)
        // and config.patch to persist the security level.
        // For now the select updates local state only.
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        setSecurityLevel(prev);
        onError("Failed to update security level");
      } finally {
        setSecurityBusy(false);
      }
    },
    [onError, securityLevel],
  );

  return (
    <section className={s.UiSettingsOtherSection}>
      <h3 className={s.UiSettingsOtherSectionTitle}>Agent</h3>
      <div className={s.UiSettingsOtherCard}>
        <div className={s.UiSettingsOtherRow}>
          <div className={s.UiSettingsOtherRowLabelGroup}>
            <span className={s.UiSettingsOtherRowLabel}>Command approval</span>
            <span className={s.UiSettingsOtherRowSubLabel}>
              Controls when shell commands require your approval
            </span>
          </div>
          <select
            className={s.UiSettingsOtherSelect}
            value={securityLevel}
            disabled={securityBusy}
            onChange={(e) => void handleSecurityLevelChange(e.target.value as SecurityLevel)}
          >
            <option value="balanced">Balanced</option>
            <option value="permissive">Permissive</option>
          </select>
        </div>
      </div>
      <p className={s.UiSettingsOtherHint}>
        <strong>Balanced</strong> — approve only unknown commands. <strong>Permissive</strong> —
        no approvals needed.
      </p>
    </section>
  );
}
