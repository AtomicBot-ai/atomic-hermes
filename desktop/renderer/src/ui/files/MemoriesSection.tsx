import React from "react";
import { SidebarSection } from "./SidebarSection";
import s from "./FilesPage.module.css";

type MemoryFileInfo = {
  name: string;
  exists: boolean;
};

type MemoriesApi = {
  sidebarListProfiles: () => Promise<{ profiles: string[]; selected: string }>;
  sidebarSelectProfile: (profileName: string) => Promise<{ ok: boolean; selected: string }>;
  sidebarListMemories: () => Promise<MemoryFileInfo[]>;
};

function getApi(): MemoriesApi | null {
  return (window as any).hermesAPI as MemoriesApi | null;
}

function IconBrain() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2C5.8 2 4 3.8 4 6c0 1.5.8 2.8 2 3.5V12a1 1 0 001 1h2a1 1 0 001-1V9.5c1.2-.7 2-2 2-3.5 0-2.2-1.8-4-4-4z"
        stroke="#6c71c4"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 13.5h4" stroke="#6c71c4" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export type MemoriesSectionProps = {
  collapsed: boolean;
  onToggle: () => void;
  onSelectMemory: (filename: string) => void;
  activeMemoryFile: string | null;
  onProfileChange?: () => void;
};

export function MemoriesSection({
  collapsed,
  onToggle,
  onSelectMemory,
  activeMemoryFile,
  onProfileChange,
}: MemoriesSectionProps) {
  const [profiles, setProfiles] = React.useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = React.useState<string>("default");
  const [memFiles, setMemFiles] = React.useState<MemoryFileInfo[]>([]);

  const loadData = React.useCallback(() => {
    const api = getApi();
    if (!api) return;
    void api.sidebarListProfiles().then((r) => {
      setProfiles(r.profiles);
      setSelectedProfile(r.selected);
    });
    void api.sidebarListMemories().then(setMemFiles);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData, collapsed]);

  const handleProfileChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const api = getApi();
      if (!api) return;
      const name = e.target.value;
      void api.sidebarSelectProfile(name).then((r) => {
        setSelectedProfile(r.selected);
        void api.sidebarListMemories().then(setMemFiles);
        onProfileChange?.();
      });
    },
    [onProfileChange],
  );

  const showPicker = profiles.length > 1;

  const subtitle = showPicker ? undefined : (selectedProfile !== "default" ? selectedProfile : undefined);

  return (
    <SidebarSection title="MEMORIES" subtitle={subtitle} collapsed={collapsed} onToggle={onToggle}>
      {showPicker && (
        <div className={s.ProfilePicker}>
          <select
            className={s.ProfileSelect}
            value={selectedProfile}
            onChange={handleProfileChange}
          >
            {profiles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}
      <div className={s.SidebarSectionList}>
        {memFiles.map((mf) => (
          <div
            key={mf.name}
            className={`${s.SidebarItem} ${activeMemoryFile === mf.name ? s.SidebarItemActive : ""} ${!mf.exists ? s.SidebarItemDisabled : ""}`}
            onClick={() => {
              if (mf.exists) onSelectMemory(mf.name);
            }}
          >
            <span className={s.SidebarItemIcon}><IconBrain /></span>
            <span className={s.SidebarItemLabel}>{mf.name}</span>
            {!mf.exists && <span className={s.SidebarItemBadge}>empty</span>}
          </div>
        ))}
        {memFiles.length === 0 && (
          <div className={s.SidebarSectionEmpty}>No memory files found</div>
        )}
      </div>
    </SidebarSection>
  );
}
