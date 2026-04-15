import React from "react";
import s from "./FilesPage.module.css";

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type SidebarSectionProps = {
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export function SidebarSection({ title, subtitle, collapsed, onToggle, children }: SidebarSectionProps) {
  return (
    <div className={s.SidebarSection}>
      <button type="button" className={s.SidebarSectionHeader} onClick={onToggle}>
        <span className={s.SidebarSectionChevron}>
          <IconChevron open={!collapsed} />
        </span>
        <span className={s.SidebarSectionTitle}>{title}</span>
        {subtitle && <span className={s.SidebarSectionSubtitle}>{subtitle}</span>}
      </button>
      {!collapsed && <div className={s.SidebarSectionBody}>{children}</div>}
    </div>
  );
}
