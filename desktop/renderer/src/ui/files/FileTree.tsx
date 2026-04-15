import React from "react";
import s from "./FilesPage.module.css";

export type DirEntry = {
  name: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
};

type FilesApi = {
  filesListDir: (path: string) => Promise<DirEntry[]>;
  filesCreateDir: (path: string) => Promise<{ ok: boolean }>;
  filesRename: (oldPath: string, newPath: string) => Promise<{ ok: boolean }>;
  filesDelete: (path: string) => Promise<{ ok: boolean }>;
};

function getApi(): FilesApi | null {
  return (window as any).hermesAPI as FilesApi | null;
}

// ── Icons ──────────────────────────────────────────────────────────────

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFolder({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M1.5 3.5A1 1 0 012.5 2.5h3l1.5 1.5h5.5a1 1 0 011 1v1H2.5l-1-2z" fill="#e8a838" opacity="0.5" />
        <path d="M2 6h11l-1.5 7H3.5L2 6z" fill="#e8a838" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 4A1.5 1.5 0 013 2.5h3.17a1 1 0 01.7.3L8.3 4.2a1 1 0 00.7.3H13A1.5 1.5 0 0114.5 6v6A1.5 1.5 0 0113 13.5H3A1.5 1.5 0 011.5 12V4z"
        stroke="#e8a838"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function IconFile({ ext }: { ext: string }) {
  const colorMap: Record<string, string> = {
    yaml: "#cb4b16",
    yml: "#cb4b16",
    json: "#b58900",
    md: "#6c71c4",
    py: "#268bd2",
    ts: "#2b7489",
    js: "#f1e05a",
    env: "#859900",
    toml: "#9d550f",
    lock: "#555",
    db: "#555",
  };
  const color = colorMap[ext] || "#8e8e8e";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 1.5h5.5L13 5v9a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 14V3A1.5 1.5 0 014 1.5z"
        stroke={color}
        strokeWidth="1.1"
      />
      <path d="M9 1.5V5h3.5" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

// ── Context Menu ───────────────────────────────────────────────────────

type ContextMenuProps = {
  x: number;
  y: number;
  isDir: boolean;
  isFavorite: boolean;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onClose: () => void;
};

function ContextMenu({ x, y, isDir, isFavorite, onNewFile, onNewFolder, onRename, onDelete, onToggleFavorite, onClose }: ContextMenuProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className={s.ContextMenu} style={{ left: x, top: y }}>
      <button type="button" className={s.ContextMenuItem} onClick={onToggleFavorite}>
        {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
      </button>
      <div className={s.ContextMenuDivider} />
      {isDir && (
        <>
          <button type="button" className={s.ContextMenuItem} onClick={onNewFile}>New File</button>
          <button type="button" className={s.ContextMenuItem} onClick={onNewFolder}>New Folder</button>
          <div className={s.ContextMenuDivider} />
        </>
      )}
      <button type="button" className={s.ContextMenuItem} onClick={onRename}>Rename</button>
      <button type="button" className={s.ContextMenuItem} onClick={onDelete}>Delete</button>
    </div>
  );
}

// ── Inline input for new file / rename ─────────────────────────────────

function InlineInput({ initial, onSubmit, onCancel }: {
  initial: string;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(initial);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      className={s.InlineInput}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) {
          e.preventDefault();
          onSubmit(value.trim());
        }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        if (value.trim() && value.trim() !== initial) onSubmit(value.trim());
        else onCancel();
      }}
    />
  );
}

// Module-level set of expanded directory paths — survives unmount/remount
const _expandedPaths = new Set<string>();

// ── Tree Node ──────────────────────────────────────────────────────────

type TreeNodeProps = {
  entry: DirEntry;
  parentPath: string;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onTreeChanged: () => void;
  onToggleFavorite?: (path: string, type: "file" | "dir") => void;
  favoritePaths?: Set<string>;
  depth: number;
};

function TreeNode({ entry, parentPath, selectedPath, onSelectFile, onTreeChanged, onToggleFavorite, favoritePaths, depth }: TreeNodeProps) {
  const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const isDir = entry.type === "dir";
  const [expanded, setExpanded] = React.useState(isDir && _expandedPaths.has(fullPath));
  const [children, setChildren] = React.useState<DirEntry[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = React.useState(false);
  const [creating, setCreating] = React.useState<"file" | "dir" | null>(null);

  const ext = entry.name.includes(".") ? entry.name.split(".").pop()!.toLowerCase() : "";

  const loadChildren = React.useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    try {
      const entries = await api.filesListDir(fullPath);
      setChildren(entries);
    } catch (err) {
      console.error("Failed to list dir:", err);
    } finally {
      setLoading(false);
    }
  }, [fullPath]);

  // Auto-load children for directories that were expanded before unmount
  React.useEffect(() => {
    if (isDir && expanded && children === null) {
      void loadChildren();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = React.useCallback(() => {
    if (!isDir) return;
    const next = !expanded;
    setExpanded(next);
    if (next) {
      _expandedPaths.add(fullPath);
    } else {
      _expandedPaths.delete(fullPath);
    }
    if (next && children === null) {
      void loadChildren();
    }
  }, [isDir, expanded, children, loadChildren, fullPath]);

  const handleClick = React.useCallback(() => {
    if (isDir) {
      handleToggle();
    } else {
      onSelectFile(fullPath);
    }
  }, [isDir, handleToggle, onSelectFile, fullPath]);

  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleDelete = React.useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setContextMenu(null);
    try {
      await api.filesDelete(fullPath);
      onTreeChanged();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }, [fullPath, onTreeChanged]);

  const handleRenameSubmit = React.useCallback(async (newName: string) => {
    const api = getApi();
    if (!api) return;
    setRenaming(false);
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    try {
      await api.filesRename(fullPath, newPath);
      onTreeChanged();
    } catch (err) {
      console.error("Failed to rename:", err);
    }
  }, [fullPath, parentPath, onTreeChanged]);

  const handleCreateSubmit = React.useCallback(async (name: string) => {
    const api = getApi();
    if (!api || !creating) return;
    const newPath = `${fullPath}/${name}`;
    try {
      if (creating === "dir") {
        await api.filesCreateDir(newPath);
      } else {
        const writeApi = (window as any).hermesAPI as { filesWriteFile: (p: string, c: string) => Promise<{ ok: boolean }> };
        await writeApi.filesWriteFile(newPath, "");
      }
      setCreating(null);
      setExpanded(true);
      void loadChildren();
    } catch (err) {
      console.error("Failed to create:", err);
      setCreating(null);
    }
  }, [creating, fullPath, loadChildren]);

  const isSelected = selectedPath === fullPath;

  return (
    <div>
      <div
        className={`${s.TreeNode} ${isSelected ? s.TreeNodeSelected : ""}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        role="treeitem"
        aria-expanded={isDir ? expanded : undefined}
      >
        {isDir && (
          <span className={s.TreeNodeChevron}>
            <IconChevron open={expanded} />
          </span>
        )}
        {!isDir && <span className={s.TreeNodeChevronSpacer} />}
        <span className={s.TreeNodeIcon}>
          {isDir ? <IconFolder open={expanded} /> : <IconFile ext={ext} />}
        </span>
        {renaming ? (
          <InlineInput
            initial={entry.name}
            onSubmit={handleRenameSubmit}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <span className={s.TreeNodeLabel}>{entry.name}</span>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isDir={isDir}
          isFavorite={favoritePaths?.has(fullPath) ?? false}
          onToggleFavorite={() => {
            setContextMenu(null);
            onToggleFavorite?.(fullPath, isDir ? "dir" : "file");
          }}
          onNewFile={() => {
            setContextMenu(null);
            if (isDir) {
              setExpanded(true);
              setCreating("file");
              if (children === null) void loadChildren();
            }
          }}
          onNewFolder={() => {
            setContextMenu(null);
            if (isDir) {
              setExpanded(true);
              setCreating("dir");
              if (children === null) void loadChildren();
            }
          }}
          onRename={() => {
            setContextMenu(null);
            setRenaming(true);
          }}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}

      {isDir && expanded && (
        <div role="group">
          {loading && <div className={s.TreeLoading} style={{ paddingLeft: (depth + 1) * 16 + 8 }}>Loading...</div>}
          {children?.map((child) => (
            <TreeNode
              key={child.name}
              entry={child}
              parentPath={fullPath}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              onTreeChanged={() => void loadChildren()}
              onToggleFavorite={onToggleFavorite}
              favoritePaths={favoritePaths}
              depth={depth + 1}
            />
          ))}
          {creating && (
            <div className={s.TreeNode} style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
              <span className={s.TreeNodeChevronSpacer} />
              <span className={s.TreeNodeIcon}>
                {creating === "dir" ? <IconFolder open={false} /> : <IconFile ext="" />}
              </span>
              <InlineInput
                initial=""
                onSubmit={handleCreateSubmit}
                onCancel={() => setCreating(null)}
              />
            </div>
          )}
          {!loading && children?.length === 0 && !creating && (
            <div className={s.TreeEmpty} style={{ paddingLeft: (depth + 1) * 16 + 8 }}>Empty</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FileTree Root ──────────────────────────────────────────────────────

export type FileTreeProps = {
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  refreshKey: number;
  onToggleFavorite?: (path: string, type: "file" | "dir") => void;
  favoritePaths?: Set<string>;
};

export function FileTree({ selectedPath, onSelectFile, refreshKey, onToggleFavorite, favoritePaths }: FileTreeProps) {
  const [entries, setEntries] = React.useState<DirEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [creating, setCreating] = React.useState<"file" | "dir" | null>(null);

  const loadRoot = React.useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    try {
      const result = await api.filesListDir(".");
      setEntries(result);
    } catch (err) {
      console.error("Failed to list root:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRoot();
  }, [loadRoot, refreshKey]);

  const handleRootContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCreateSubmit = React.useCallback(async (name: string) => {
    const api = getApi();
    if (!api || !creating) return;
    try {
      if (creating === "dir") {
        await api.filesCreateDir(name);
      } else {
        const writeApi = (window as any).hermesAPI as { filesWriteFile: (p: string, c: string) => Promise<{ ok: boolean }> };
        await writeApi.filesWriteFile(name, "");
      }
      setCreating(null);
      void loadRoot();
    } catch (err) {
      console.error("Failed to create:", err);
      setCreating(null);
    }
  }, [creating, loadRoot]);

  return (
    <div className={s.FileTreeInner} role="tree" onContextMenu={handleRootContextMenu}>
      <div className={s.FileTreeContent}>
        {loading ? (
          <div className={s.TreeLoading}>Loading...</div>
        ) : (
          <>
            {entries.map((entry) => (
              <TreeNode
                key={entry.name}
                entry={entry}
                parentPath=""
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
                onTreeChanged={loadRoot}
                onToggleFavorite={onToggleFavorite}
                favoritePaths={favoritePaths}
                depth={0}
              />
            ))}
            {creating && (
              <div className={s.TreeNode} style={{ paddingLeft: 8 }}>
                <span className={s.TreeNodeChevronSpacer} />
                <span className={s.TreeNodeIcon}>
                  {creating === "dir" ? <IconFolder open={false} /> : <IconFile ext="" />}
                </span>
                <InlineInput
                  initial=""
                  onSubmit={handleCreateSubmit}
                  onCancel={() => setCreating(null)}
                />
              </div>
            )}
          </>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isDir={true}
          isFavorite={false}
          onToggleFavorite={() => setContextMenu(null)}
          onNewFile={() => { setContextMenu(null); setCreating("file"); }}
          onNewFolder={() => { setContextMenu(null); setCreating("dir"); }}
          onRename={() => setContextMenu(null)}
          onDelete={() => setContextMenu(null)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
