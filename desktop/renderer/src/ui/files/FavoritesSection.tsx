import React from "react";
import { SidebarSection } from "./SidebarSection";
import s from "./FilesPage.module.css";

export type FavoriteEntry = {
  path: string;
  type: "file" | "dir";
  name: string;
};

type FavoritesApi = {
  sidebarGetFavorites: () => Promise<FavoriteEntry[]>;
  sidebarSetFavorites: (entries: FavoriteEntry[]) => Promise<{ ok: boolean }>;
};

function getApi(): FavoritesApi | null {
  return (window as any).hermesAPI as FavoritesApi | null;
}

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 4A1.5 1.5 0 013 2.5h3.17a1 1 0 01.7.3L8.3 4.2a1 1 0 00.7.3H13A1.5 1.5 0 0114.5 6v6A1.5 1.5 0 0113 13.5H3A1.5 1.5 0 011.5 12V4z"
        stroke="#e8a838"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 1.5h5.5L13 5v9a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 14V3A1.5 1.5 0 014 1.5z"
        stroke="#8e8e8e"
        strokeWidth="1.1"
      />
      <path d="M9 1.5V5h3.5" stroke="#8e8e8e" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

export type FavoritesSectionProps = {
  collapsed: boolean;
  onToggle: () => void;
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
  favorites: FavoriteEntry[];
  onFavoritesChange: (entries: FavoriteEntry[]) => void;
};

export function FavoritesSection({
  collapsed,
  onToggle,
  onSelectFile,
  selectedPath,
  favorites,
  onFavoritesChange,
}: FavoritesSectionProps) {
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; idx: number } | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleRemove = React.useCallback(async (idx: number) => {
    const api = getApi();
    if (!api) return;
    const next = favorites.filter((_, i) => i !== idx);
    onFavoritesChange(next);
    await api.sidebarSetFavorites(next);
    setContextMenu(null);
  }, [favorites, onFavoritesChange]);

  return (
    <SidebarSection title="FAVORITES" collapsed={collapsed} onToggle={onToggle}>
      {favorites.length === 0 ? (
        <div className={s.SidebarSectionEmpty}>No favorites yet</div>
      ) : (
        <div className={s.SidebarSectionList}>
          {favorites.map((fav, idx) => (
            <div
              key={fav.path}
              className={`${s.SidebarItem} ${selectedPath === fav.path ? s.SidebarItemActive : ""}`}
              onClick={() => onSelectFile(fav.path)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY, idx });
              }}
            >
              <span className={s.SidebarItemIcon}>
                {fav.type === "dir" ? <IconFolder /> : <IconFile />}
              </span>
              <span className={s.SidebarItemLabel}>{fav.name}</span>
            </div>
          ))}
        </div>
      )}

      {contextMenu && (
        <div ref={menuRef} className={s.ContextMenu} style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            className={s.ContextMenuItem}
            onClick={() => void handleRemove(contextMenu.idx)}
          >
            Remove from Favorites
          </button>
        </div>
      )}
    </SidebarSection>
  );
}
