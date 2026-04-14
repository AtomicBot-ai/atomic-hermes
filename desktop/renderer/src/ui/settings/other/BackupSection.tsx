import React from "react";

import { useSettingsState } from "../settings-context";
import { createBackup } from "../../../services/api";
import { errorToMessage } from "@lib/error-format";
import { RestoreBackupModal } from "../RestoreBackupModal";
import s from "../OtherTab.module.css";

export function BackupSection({ onError }: { onError: (msg: string | null) => void }) {
  const [backupBusy, setBackupBusy] = React.useState(false);
  const [backupResult, setBackupResult] = React.useState<string | null>(null);
  const [restoreModalOpen, setRestoreModalOpen] = React.useState(false);
  const { port } = useSettingsState();

  const handleCreateBackup = React.useCallback(async () => {
    onError(null);
    setBackupResult(null);
    setBackupBusy(true);
    try {
      const result = await createBackup(port);
      if (result.ok) {
        setBackupResult(result.path || "Backup created successfully");
      } else {
        onError(result.error || "Failed to create backup");
      }
    } catch (err) {
      onError(errorToMessage(err));
    } finally {
      setBackupBusy(false);
    }
  }, [onError, port]);

  const handleRestored = React.useCallback(() => {
    setRestoreModalOpen(false);
  }, []);

  return (
    <>
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Backup</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Create backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              disabled={backupBusy}
              onClick={() => void handleCreateBackup()}
            >
              {backupBusy ? "Creating..." : "Save to file"}
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Restore from backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => setRestoreModalOpen(true)}
            >
              Choose file
            </button>
          </div>
        </div>
        {backupResult && (
          <p className={s.UiSettingsOtherHint} style={{ color: "#27c281" }}>
            Backup saved to {backupResult}
          </p>
        )}
        <p className={s.UiSettingsOtherHint}>
          Create a full backup of your Hermes configuration or restore from a previously saved
          backup.
        </p>
      </section>

      <RestoreBackupModal
        open={restoreModalOpen}
        onClose={() => setRestoreModalOpen(false)}
        onRestored={handleRestored}
      />
    </>
  );
}
