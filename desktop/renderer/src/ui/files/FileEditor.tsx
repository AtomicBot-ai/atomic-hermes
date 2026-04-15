import React from "react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import s from "./FilesPage.module.css";

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

const EXT_TO_LANGUAGE: Record<string, string> = {
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  md: "markdown",
  py: "python",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  css: "css",
  html: "html",
  xml: "xml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  toml: "ini",
  cfg: "ini",
  ini: "ini",
  env: "plaintext",
  txt: "plaintext",
  log: "plaintext",
  sql: "sql",
};

function detectLanguage(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";
  if (name === ".env" || name.startsWith(".env.")) return "plaintext";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return EXT_TO_LANGUAGE[ext] || "plaintext";
}

export type FileEditorProps = {
  filePath: string | null;
  content: string;
  dirty: boolean;
  onContentChange: (content: string) => void;
  onSave: () => void;
  loading: boolean;
  error: string | null;
};

export function FileEditor({ filePath, content, dirty, onContentChange, onSave, loading, error }: FileEditorProps) {
  const editorRef = React.useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const language = filePath ? detectLanguage(filePath) : "plaintext";

  const handleMount: OnMount = React.useCallback((editor, monaco) => {
    editorRef.current = editor;

    editor.addAction({
      id: "hermes-save",
      label: "Save File",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => onSave(),
    });
  }, [onSave]);

  React.useEffect(() => {
    return () => {
      editorRef.current = null;
    };
  }, []);

  if (!filePath) {
    return (
      <div className={s.EditorEmpty}>
        <div className={s.EditorEmptyIcon}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path d="M12 6h16l12 12v24a4 4 0 01-4 4H12a4 4 0 01-4-4V10a4 4 0 014-4z" stroke="currentColor" strokeWidth="2" />
            <path d="M28 6v12h12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>
        <div className={s.EditorEmptyText}>Select a file to view or edit</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={s.EditorEmpty}>
        <div className={s.EditorEmptyText}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={s.EditorEmpty}>
        <div className={s.EditorErrorText}>{error}</div>
      </div>
    );
  }

  return (
    <div className={s.EditorContainer}>
      <Editor
        height="100%"
        language={language}
        value={content}
        theme="vs-dark"
        onChange={(v) => onContentChange(v ?? "")}
        onMount={handleMount}
        options={{
          fontSize: 13,
          fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
          lineHeight: 20,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          renderLineHighlight: "gutter",
          padding: { top: 12 },
          automaticLayout: true,
          tabSize: 2,
        }}
        loading={<div className={s.EditorEmptyText}>Initializing editor...</div>}
      />
    </div>
  );
}
