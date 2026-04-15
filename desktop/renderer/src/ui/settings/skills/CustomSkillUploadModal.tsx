import React from "react";
import { Modal, PrimaryButton, SecondaryButton } from "@shared/kit";
import s from "./CustomSkillUploadModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onInstall: (identifier: string) => Promise<void>;
};

export function CustomSkillUploadModal({ open, onClose, onInstall }: Props) {
  const [identifier, setIdentifier] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = React.useCallback(async () => {
    const trimmed = identifier.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      await onInstall(trimmed);
      setIdentifier("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Installation failed");
    } finally {
      setLoading(false);
    }
  }, [identifier, onInstall, onClose]);

  return (
    <Modal open={open} onClose={onClose} header="Install custom skill" aria-label="Install custom skill">
      <div className={s.body}>
        <p className={s.hint}>
          Enter a skill identifier to install from the Hermes Skills Hub.
          Format: <code>author/skill-name</code> or a GitHub URL.
        </p>
        <input
          className={s.input}
          type="text"
          placeholder="e.g. hermes-skills/web-researcher"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmit();
          }}
          disabled={loading}
        />
        {error && <p className={s.error}>{error}</p>}
        <div className={s.warn}>
          <span className={s.warnIcon}>⚠</span>
          <span>
            Custom skills can execute arbitrary code. Only install skills from sources you trust.
          </span>
        </div>
        <div className={s.actions}>
          <SecondaryButton onClick={onClose} disabled={loading}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={!identifier.trim() || loading}>
            {loading ? "Installing..." : "Install"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
