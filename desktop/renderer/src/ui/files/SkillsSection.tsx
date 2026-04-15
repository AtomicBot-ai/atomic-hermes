import React from "react";
import { SidebarSection } from "./SidebarSection";
import s from "./FilesPage.module.css";

type SkillEntry = {
  name: string;
  description: string;
  dirPath: string;
};

type SkillsApi = {
  sidebarListSkills: () => Promise<SkillEntry[]>;
};

function getApi(): SkillsApi | null {
  return (window as any).hermesAPI as SkillsApi | null;
}

function IconSkill() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1l1.8 3.6L14 5.3l-3 2.9.7 4.1L8 10.5 4.3 12.3l.7-4.1-3-2.9 4.2-.7L8 1z"
        stroke="#b58900"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type SkillsSectionProps = {
  collapsed: boolean;
  onToggle: () => void;
  onSelectSkill: (dirPath: string) => void;
  activeSkillDir: string | null;
  refreshKey?: number;
};

export function SkillsSection({
  collapsed,
  onToggle,
  onSelectSkill,
  activeSkillDir,
  refreshKey,
}: SkillsSectionProps) {
  const [skills, setSkills] = React.useState<SkillEntry[]>([]);

  React.useEffect(() => {
    const api = getApi();
    if (!api) return;
    void api.sidebarListSkills().then(setSkills);
  }, [collapsed, refreshKey]);

  return (
    <SidebarSection title="SKILLS" collapsed={collapsed} onToggle={onToggle}>
      {skills.length === 0 ? (
        <div className={s.SidebarSectionEmpty}>No skills installed</div>
      ) : (
        <div className={s.SidebarSectionList}>
          {skills.map((sk) => (
            <div
              key={sk.dirPath}
              className={`${s.SidebarItem} ${activeSkillDir === sk.dirPath ? s.SidebarItemActive : ""}`}
              onClick={() => onSelectSkill(sk.dirPath)}
            >
              <span className={s.SidebarItemIcon}><IconSkill /></span>
              <div className={s.SidebarItemContent}>
                <span className={s.SidebarItemLabel}>{sk.name}</span>
                <span className={s.SidebarItemDesc}>{sk.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SidebarSection>
  );
}
