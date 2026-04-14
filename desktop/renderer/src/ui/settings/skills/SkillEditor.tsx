import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppSelector } from "@store/hooks";
import { fetchSkillDetail, updateSkill } from "../../../services/skills-api";
import s from "./SkillEditor.module.css";

export function SkillEditor() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const gatewayState = useAppSelector((st) => st.gateway.state);
  const port = gatewayState?.kind === "ready" ? gatewayState.port : 8642;

  const [content, setContent] = React.useState("");
  const [savedContent, setSavedContent] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saveMsg, setSaveMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!name) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSkillDetail(port, name)
      .then((detail) => {
        if (cancelled) return;
        if (!detail.success || !detail.content) {
          setError(detail.error || "Skill content not available");
          return;
        }
        setContent(detail.content);
        setSavedContent(detail.content);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load skill");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [port, name]);

  const dirty = content !== savedContent;

  const handleSave = React.useCallback(async () => {
    if (!name || !content.trim()) return;
    setSaving(true);
    setError(null);
    setSaveMsg(null);
    try {
      const res = await updateSkill(port, name, content);
      if (!res.ok) {
        setError(res.error || "Failed to save");
        return;
      }
      setSavedContent(content);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [port, name, content]);

  const handleCancel = React.useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    },
    [handleSave],
  );

  if (loading) {
    return (
      <div className={s.root}>
        <div className={s.center}>Loading skill...</div>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <div className={s.toolbar}>
        <button type="button" className={s.backBtn} onClick={handleCancel}>
          ← Back
        </button>
        <h2 className={s.title}>{name}</h2>
        <div className={s.actions}>
          {saveMsg && <span className={s.saveMsg}>{saveMsg}</span>}
          <button
            type="button"
            className={s.cancelBtn}
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={s.saveBtn}
            disabled={saving || !dirty}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error && <div className={s.errorMsg}>{error}</div>}
      <textarea
        className={s.editor}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoFocus
      />
    </div>
  );
}
