import React from "react";
import { FileTree } from "./FileTree";
import { FileEditor } from "./FileEditor";
import { SnapshotPanel, type SnapshotEntry } from "./SnapshotPanel";
import { DiffView } from "./DiffView";
import { SidebarSection } from "./SidebarSection";
import { FavoritesSection, type FavoriteEntry } from "./FavoritesSection";
import { MemoriesSection } from "./MemoriesSection";
import { SkillsSection } from "./SkillsSection";
import s from "./FilesPage.module.css";

type FileSource = "stateDir" | "memory" | "skill";

type FilesApi = {
  filesReadFile: (path: string) => Promise<{ content: string; size: number }>;
  filesWriteFile: (path: string, content: string) => Promise<{ ok: boolean }>;
  filesReadSnapshot: (snapshotPath: string) => Promise<{ content: string; size: number }>;
  filesRestoreSnapshot: (path: string, snapshotPath: string) => Promise<{ ok: boolean }>;
  sidebarReadMemoryFile: (filename: string) => Promise<{ content: string; size: number; relativePath: string }>;
  sidebarWriteMemoryFile: (filename: string, content: string) => Promise<{ ok: boolean }>;
  sidebarReadSkillFile: (skillDir: string) => Promise<{ content: string; size: number; relativePath: string }>;
  sidebarGetFavorites: () => Promise<FavoriteEntry[]>;
  sidebarSetFavorites: (entries: FavoriteEntry[]) => Promise<{ ok: boolean }>;
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

function IconHistory({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: active ? 1 : 0.6 }}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Module-level cache survives unmount/remount when navigating between pages
const _pageCache = {
  selectedPath: null as string | null,
  fileSource: "stateDir" as FileSource,
  sourceKey: null as string | null,
  dividerX: 260,
  historyOpen: false,
  historyWidth: 260,
  favoritesCollapsed: false,
  memoriesCollapsed: false,
  skillsCollapsed: true,
  filesCollapsed: false,
  favorites: [] as FavoriteEntry[],
};

export function FilesPage() {
  const [selectedPath, setSelectedPath] = React.useState<string | null>(_pageCache.selectedPath);
  const [fileSource, setFileSource] = React.useState<FileSource>(_pageCache.fileSource);
  const [sourceKey, setSourceKey] = React.useState<string | null>(_pageCache.sourceKey);
  const [content, setContent] = React.useState("");
  const [savedContent, setSavedContent] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [treeRefreshKey, setTreeRefreshKey] = React.useState(0);
  const [dividerX, setDividerX] = React.useState(_pageCache.dividerX);
  const draggingRef = React.useRef(false);

  // Snapshot panel state
  const [historyOpen, setHistoryOpen] = React.useState(_pageCache.historyOpen);
  const [historyWidth, setHistoryWidth] = React.useState(_pageCache.historyWidth);
  const historyDraggingRef = React.useRef(false);

  // Diff state
  const [diffSnapshot, setDiffSnapshot] = React.useState<SnapshotEntry | null>(null);
  const [diffSnapshotContent, setDiffSnapshotContent] = React.useState<string | null>(null);

  // Section collapsed states
  const [favoritesCollapsed, setFavoritesCollapsed] = React.useState(_pageCache.favoritesCollapsed);
  const [memoriesCollapsed, setMemoriesCollapsed] = React.useState(_pageCache.memoriesCollapsed);
  const [skillsCollapsed, setSkillsCollapsed] = React.useState(_pageCache.skillsCollapsed);
  const [filesCollapsed, setFilesCollapsed] = React.useState(_pageCache.filesCollapsed);

  // Favorites
  const [favorites, setFavorites] = React.useState<FavoriteEntry[]>(_pageCache.favorites);

  // Incremented when profile changes to trigger SkillsSection reload
  const [skillsRefreshKey, setSkillsRefreshKey] = React.useState(0);

  // Load favorites on mount
  React.useEffect(() => {
    const api = getApi();
    if (!api) return;
    void api.sidebarGetFavorites().then((entries) => {
      setFavorites(entries);
      _pageCache.favorites = entries;
    });
  }, []);

  // Sync UI state back to module-level cache
  React.useEffect(() => { _pageCache.selectedPath = selectedPath; }, [selectedPath]);
  React.useEffect(() => { _pageCache.fileSource = fileSource; }, [fileSource]);
  React.useEffect(() => { _pageCache.sourceKey = sourceKey; }, [sourceKey]);
  React.useEffect(() => { _pageCache.dividerX = dividerX; }, [dividerX]);
  React.useEffect(() => { _pageCache.historyOpen = historyOpen; }, [historyOpen]);
  React.useEffect(() => { _pageCache.historyWidth = historyWidth; }, [historyWidth]);
  React.useEffect(() => { _pageCache.favoritesCollapsed = favoritesCollapsed; }, [favoritesCollapsed]);
  React.useEffect(() => { _pageCache.memoriesCollapsed = memoriesCollapsed; }, [memoriesCollapsed]);
  React.useEffect(() => { _pageCache.skillsCollapsed = skillsCollapsed; }, [skillsCollapsed]);
  React.useEffect(() => { _pageCache.filesCollapsed = filesCollapsed; }, [filesCollapsed]);

  const dirty = content !== savedContent && selectedPath !== null;

  const loadFile = React.useCallback(async (filePath: string, source: FileSource = "stateDir") => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError(null);
    setDiffSnapshot(null);
    setDiffSnapshotContent(null);
    try {
      let content: string;
      let resolvedPath: string;

      if (source === "memory") {
        const result = await api.sidebarReadMemoryFile(filePath);
        content = result.content;
        resolvedPath = result.relativePath;
      } else if (source === "skill") {
        const result = await api.sidebarReadSkillFile(filePath);
        content = result.content;
        resolvedPath = result.relativePath;
      } else {
        const result = await api.filesReadFile(filePath);
        content = result.content;
        resolvedPath = filePath;
      }
      setContent(content);
      setSavedContent(content);
      setSelectedPath(resolvedPath);
      setSourceKey(source !== "stateDir" ? filePath : null);
      setFileSource(source);
    } catch (err: any) {
      setError(err?.message || "Failed to read file");
      setSelectedPath(filePath);
      setSourceKey(source !== "stateDir" ? filePath : null);
      setFileSource(source);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveFile = React.useCallback(async () => {
    const api = getApi();
    if (!api || !selectedPath) return;
    try {
      if (fileSource === "memory" && sourceKey) {
        await api.sidebarWriteMemoryFile(sourceKey, content);
      } else if (fileSource === "stateDir") {
        await api.filesWriteFile(selectedPath, content);
      }
      setSavedContent(content);
    } catch (err: any) {
      console.error("Failed to save:", err);
    }
  }, [selectedPath, fileSource, sourceKey, content]);

  const handleSelectFile = React.useCallback((path: string) => {
    void loadFile(path, "stateDir");
  }, [loadFile]);

  const handleSelectMemory = React.useCallback((filename: string) => {
    void loadFile(filename, "memory");
  }, [loadFile]);

  const handleSelectSkill = React.useCallback((dirPath: string) => {
    void loadFile(dirPath, "skill");
  }, [loadFile]);

  const handleFavoritesChange = React.useCallback((entries: FavoriteEntry[]) => {
    setFavorites(entries);
    _pageCache.favorites = entries;
  }, []);

  const handleProfileChange = React.useCallback(() => {
    setSkillsRefreshKey((k) => k + 1);
  }, []);

  const handleToggleFavorite = React.useCallback(async (favPath: string, type: "file" | "dir") => {
    const api = getApi();
    if (!api) return;
    const exists = favorites.some((f) => f.path === favPath);
    let next: FavoriteEntry[];
    if (exists) {
      next = favorites.filter((f) => f.path !== favPath);
    } else {
      const name = favPath.includes("/") ? favPath.split("/").pop()! : favPath;
      next = [...favorites, { path: favPath, type, name }];
    }
    setFavorites(next);
    _pageCache.favorites = next;
    await api.sidebarSetFavorites(next);
  }, [favorites]);

  // Re-load the previously selected file on mount
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current && _pageCache.selectedPath) {
      const src = _pageCache.fileSource;
      const key = (src !== "stateDir" && _pageCache.sourceKey) ? _pageCache.sourceKey : _pageCache.selectedPath;
      void loadFile(key, src);
    }
    mountedRef.current = true;
  }, [loadFile]);

  const handleContentChange = React.useCallback((newContent: string) => {
    setContent(newContent);
  }, []);

  // Left divider drag
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

  // Right divider drag (history panel)
  const handleHistoryDividerMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    historyDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = historyWidth;

    const onMouseMove = (me: MouseEvent) => {
      if (!historyDraggingRef.current) return;
      const delta = startX - me.clientX;
      const next = Math.max(180, Math.min(500, startWidth + delta));
      setHistoryWidth(next);
    };

    const onMouseUp = () => {
      historyDraggingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [historyWidth]);

  // Snapshot compare handler
  const handleCompareSnapshot = React.useCallback(async (snapshot: SnapshotEntry) => {
    const api = getApi();
    if (!api) return;

    if (diffSnapshot?.snapshotPath === snapshot.snapshotPath) {
      setDiffSnapshot(null);
      setDiffSnapshotContent(null);
      return;
    }

    try {
      const result = await api.filesReadSnapshot(snapshot.snapshotPath);
      setDiffSnapshot(snapshot);
      setDiffSnapshotContent(result.content);
    } catch (err) {
      console.error("Failed to read snapshot:", err);
    }
  }, [diffSnapshot]);

  const handleCloseDiff = React.useCallback(() => {
    setDiffSnapshot(null);
    setDiffSnapshotContent(null);
  }, []);

  const handleRestoreFromDiff = React.useCallback(async () => {
    const api = getApi();
    if (!api || !selectedPath || !diffSnapshot) return;
    try {
      await api.filesRestoreSnapshot(selectedPath, diffSnapshot.snapshotPath);
      setDiffSnapshot(null);
      setDiffSnapshotContent(null);
      void loadFile(selectedPath);
    } catch (err) {
      console.error("Failed to restore:", err);
    }
  }, [selectedPath, diffSnapshot, loadFile]);

  const handleRefreshFile = React.useCallback(() => {
    if (selectedPath) void loadFile(selectedPath);
  }, [selectedPath, loadFile]);

  const isReadOnly = fileSource === "skill";
  const showDiff = diffSnapshot !== null && diffSnapshotContent !== null && selectedPath !== null;

  const activeMemoryFile = fileSource === "memory" ? sourceKey : null;
  const activeSkillDir = fileSource === "skill" ? sourceKey : null;

  return (
    <div className={s.FilesPage}>
      {/* Left panel: sidebar sections + file tree */}
      <div className={s.FilesSidebar} style={{ width: dividerX }}>
        <div className={s.SidebarScroll}>
          <FavoritesSection
            collapsed={favoritesCollapsed}
            onToggle={() => setFavoritesCollapsed((v) => !v)}
            onSelectFile={handleSelectFile}
            selectedPath={fileSource === "stateDir" ? selectedPath : null}
            favorites={favorites}
            onFavoritesChange={handleFavoritesChange}
          />
          <MemoriesSection
            collapsed={memoriesCollapsed}
            onToggle={() => setMemoriesCollapsed((v) => !v)}
            onSelectMemory={handleSelectMemory}
            activeMemoryFile={activeMemoryFile}
            onProfileChange={handleProfileChange}
          />
          <SkillsSection
            collapsed={skillsCollapsed}
            onToggle={() => setSkillsCollapsed((v) => !v)}
            onSelectSkill={handleSelectSkill}
            activeSkillDir={activeSkillDir}
            refreshKey={skillsRefreshKey}
          />
          <SidebarSection
            title="HERMES HOME"
            collapsed={filesCollapsed}
            onToggle={() => setFilesCollapsed((v) => !v)}
          >
            <FileTree
              selectedPath={fileSource === "stateDir" ? selectedPath : null}
              onSelectFile={handleSelectFile}
              refreshKey={treeRefreshKey}
              onToggleFavorite={handleToggleFavorite}
              favoritePaths={new Set(favorites.map((f) => f.path))}
            />
          </SidebarSection>
        </div>
      </div>

      {/* Left divider */}
      <div className={s.Divider} onMouseDown={handleDividerMouseDown} />

      {/* Center panel: editor / diff */}
      <div className={s.FilesMain}>
        {/* Toolbar */}
        <div className={s.Toolbar}>
          <Breadcrumb path={selectedPath} />
          <div className={s.ToolbarActions}>
            {dirty && !isReadOnly && <span className={s.DirtyDot} title="Unsaved changes" />}
            {selectedPath && !isReadOnly && (
              <button
                type="button"
                className={s.SaveButton}
                onClick={saveFile}
                disabled={!dirty}
              >
                Save
              </button>
            )}
            {isReadOnly && <span className={s.ReadOnlyBadge}>Read-only</span>}
            <button
              type="button"
              className={`${s.HistoryToggle} ${historyOpen ? s.HistoryToggleActive : ""}`}
              onClick={() => setHistoryOpen((v) => !v)}
              title={historyOpen ? "Hide history" : "Show history"}
            >
              <IconHistory active={historyOpen} />
            </button>
          </div>
        </div>

        {/* Editor or Diff */}
        <div className={s.EditorWrapper}>
          {showDiff ? (
            <DiffView
              filePath={selectedPath}
              snapshotContent={diffSnapshotContent}
              currentContent={content}
              snapshotTimestamp={diffSnapshot.timestamp}
              onClose={handleCloseDiff}
              onRestore={() => void handleRestoreFromDiff()}
            />
          ) : (
            <FileEditor
              filePath={selectedPath}
              content={content}
              dirty={dirty}
              onContentChange={handleContentChange}
              onSave={saveFile}
              loading={loading}
              error={error}
            />
          )}
        </div>
      </div>

      {/* Right divider + history panel */}
      {historyOpen && (
        <>
          <div className={s.Divider} onMouseDown={handleHistoryDividerMouseDown} />
          <div className={s.HistorySidebar} style={{ width: historyWidth }}>
            <SnapshotPanel
              selectedPath={selectedPath}
              onCompare={handleCompareSnapshot}
              activeSnapshotPath={diffSnapshot?.snapshotPath ?? null}
              onRefreshFile={handleRefreshFile}
            />
          </div>
        </>
      )}
    </div>
  );
}
