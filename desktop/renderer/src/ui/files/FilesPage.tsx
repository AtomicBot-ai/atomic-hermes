import React from "react";
import { FileTree } from "./FileTree";
import { FileEditor } from "./FileEditor";
import s from "./FilesPage.module.css";

type FilesApi = {
  filesReadFile: (path: string) => Promise<{ content: string; size: number }>;
  filesWriteFile: (path: string, content: string) => Promise<{ ok: boolean }>;
};

function getApi(): FilesApi | null {
  return (window as any).hermesAPI as FilesApi | null;
}

function Breadcrumb({ path }: { path: string | null }) {
  if (!path) return null;
  const parts = path.split("/");
  return (
    <div className={s.Breadcrumb}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className={s.BreadcrumbSep}>/</span>}
          <span className={i === parts.length - 1 ? s.BreadcrumbActive : s.BreadcrumbPart}>
            {part}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export function FilesPage() {
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [content, setContent] = React.useState("");
  const [savedContent, setSavedContent] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [treeRefreshKey, setTreeRefreshKey] = React.useState(0);
  const [dividerX, setDividerX] = React.useState(260);
  const draggingRef = React.useRef(false);

  const dirty = content !== savedContent && selectedPath !== null;

  const loadFile = React.useCallback(async (filePath: string) => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.filesReadFile(filePath);
      setContent(result.content);
      setSavedContent(result.content);
      setSelectedPath(filePath);
    } catch (err: any) {
      setError(err?.message || "Failed to read file");
      setSelectedPath(filePath);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveFile = React.useCallback(async () => {
    const api = getApi();
    if (!api || !selectedPath) return;
    try {
      await api.filesWriteFile(selectedPath, content);
      setSavedContent(content);
    } catch (err: any) {
      console.error("Failed to save:", err);
    }
  }, [selectedPath, content]);

  const handleSelectFile = React.useCallback((path: string) => {
    void loadFile(path);
  }, [loadFile]);

  const handleContentChange = React.useCallback((newContent: string) => {
    setContent(newContent);
  }, []);

  // Divider drag handling
  const handleDividerMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startWidth = dividerX;

    const onMouseMove = (me: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = me.clientX - startX;
      const next = Math.max(180, Math.min(500, startWidth + delta));
      setDividerX(next);
    };

    const onMouseUp = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [dividerX]);

  return (
    <div className={s.FilesPage}>
      {/* Left panel: file tree */}
      <div className={s.FilesSidebar} style={{ width: dividerX }}>
        <FileTree
          selectedPath={selectedPath}
          onSelectFile={handleSelectFile}
          refreshKey={treeRefreshKey}
        />
      </div>

      {/* Divider */}
      <div className={s.Divider} onMouseDown={handleDividerMouseDown} />

      {/* Right panel: editor */}
      <div className={s.FilesMain}>
        {/* Toolbar */}
        <div className={s.Toolbar}>
          <Breadcrumb path={selectedPath} />
          <div className={s.ToolbarActions}>
            {dirty && <span className={s.DirtyDot} title="Unsaved changes" />}
            {selectedPath && (
              <button
                type="button"
                className={s.SaveButton}
                onClick={saveFile}
                disabled={!dirty}
              >
                Save
              </button>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className={s.EditorWrapper}>
          <FileEditor
            filePath={selectedPath}
            content={content}
            dirty={dirty}
            onContentChange={handleContentChange}
            onSave={saveFile}
            loading={loading}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}
