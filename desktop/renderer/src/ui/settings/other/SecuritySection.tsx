import React from "react";

import { useSettingsState } from "../settings-context";
import { getConfig, patchConfig } from "../../../services/api";
import type { SecurityLevel } from "./types";
import s from "../OtherTab.module.css";

const APPROVAL_MODE_TO_LEVEL: Record<string, SecurityLevel> = {
  manual: "balanced",
  smart: "balanced",
  off: "permissive",
};

const LEVEL_TO_APPROVAL_MODE: Record<SecurityLevel, string> = {
  balanced: "manual",
  permissive: "off",
};

export function SecuritySection({ onError }: { onError: (msg: string | null) => void }) {
  const { port } = useSettingsState();
  const [securityLevel, setSecurityLevel] = React.useState<SecurityLevel>("balanced");
  const [securityBusy, setSecurityBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getConfig(port)
      .then((res) => {
        if (cancelled) return;
        const mode = (res.config?.approvals as Record<string, unknown> | undefined)?.mode;
        if (typeof mode === "string" && mode in APPROVAL_MODE_TO_LEVEL) {
          setSecurityLevel(APPROVAL_MODE_TO_LEVEL[mode]);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [port]);

  const handleSecurityLevelChange = React.useCallback(
    async (level: SecurityLevel) => {
      const prev = securityLevel;
      setSecurityLevel(level);
      setSecurityBusy(true);
      onError(null);
      try {
        const res = await patchConfig(port, {
          config: { approvals: { mode: LEVEL_TO_APPROVAL_MODE[level] } },
        });
        if (!res.ok) {
          throw new Error(res.error || "Unknown error");
        }
      } catch (err) {
        setSecurityLevel(prev);
        onError(`Failed to update security level: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSecurityBusy(false);
      }
    },
    [onError, securityLevel, port],
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
            disabled={securityBusy || !loaded}
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
