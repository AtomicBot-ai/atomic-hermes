import React from "react";
import * as monaco from "monaco-editor";
import { DiffEditor, loader } from "@monaco-editor/react";
import s from "./FilesPage.module.css";

loader.config({ monaco });

const EXT_TO_LANGUAGE: Record<string, string> = {
  yaml: "yaml", yml: "yaml", json: "json", md: "markdown",
  py: "python", ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", css: "css", html: "html",
  xml: "xml", sh: "shell", bash: "shell", zsh: "shell",
  toml: "ini", cfg: "ini", ini: "ini", env: "plaintext",
  txt: "plaintext", log: "plaintext", sql: "sql",
};

function detectLanguage(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";
  if (name === ".env" || name.startsWith(".env.")) return "plaintext";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return EXT_TO_LANGUAGE[ext] || "plaintext";
}

function formatTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export type DiffViewProps = {
  filePath: string;
  snapshotContent: string;
  currentContent: string;
  snapshotTimestamp: number;
  onClose: () => void;
  onRestore: () => void;
};

export function DiffView({
  filePath,
  snapshotContent,
  currentContent,
  snapshotTimestamp,
  onClose,
  onRestore,
}: DiffViewProps) {
  const language = detectLanguage(filePath);

  return (
    <div className={s.DiffViewContainer}>
      <div className={s.DiffBanner}>
        <div className={s.DiffBannerLeft}>
          <span className={s.DiffBannerLabel}>Comparing:</span>
          <span className={s.DiffBannerTimestamp}>{formatTimestamp(snapshotTimestamp)}</span>
          <span className={s.DiffBannerVs}>vs</span>
          <span className={s.DiffBannerCurrent}>Current</span>
        </div>
        <div className={s.DiffBannerActions}>
          <button type="button" className={s.DiffRestoreBtn} onClick={onRestore}>
            Restore
          </button>
          <button type="button" className={s.DiffCloseBtn} onClick={onClose}>
            Close diff
          </button>
        </div>
      </div>
      <div className={s.DiffEditorWrapper}>
        <DiffEditor
          height="100%"
          language={language}
          original={snapshotContent}
          modified={currentContent}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderSideBySide: true,
            readOnly: true,
            padding: { top: 12 },
            automaticLayout: true,
          }}
          loading={<div className={s.EditorEmptyText}>Loading diff...</div>}
        />
      </div>
    </div>
  );
}
