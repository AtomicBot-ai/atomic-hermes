import React from "react";
import { NavLink } from "react-router-dom";
import { Brand } from "@shared/kit";
import type { ProfileSummary } from "../../services/profile-api";
import { SessionSidebarItem } from "./SessionSidebarItem";
import { ProfileSidebarSelector } from "./ProfileSidebarSelector";
import { useTerminalSidebarVisible } from "../shared/hooks/useTerminalSidebarVisible";
import { routes } from "../app/routes";
import css from "./Sidebar.module.css";

export type SidebarSessionRow = { key: string; title: string };

export type SidebarContentProps = {
  onCollapse: () => void;
  onNewSession: () => void;
  profiles: ProfileSummary[];
  profilesLoading: boolean;
  profilesCreating: boolean;
  profileDeletingId: string | null;
  selectedProfileId: string | null;
  hostProfileId: string | null;
  profileMenuOpen: boolean;
  onProfileMenuOpenChange: (open: boolean) => void;
  onSelectProfile: (profileId: string) => void | Promise<void>;
  onCreateProfile: (name: string) => void | Promise<void>;
  onCloneProfile: (name: string) => void | Promise<void>;
  onDeleteProfile: (profileId: string) => void | Promise<void>;
  sessions: SidebarSessionRow[];
  loading: boolean;
  currentSessionKey: string | null;
  onSelectSession: (key: string) => void;
  onDeleteSession: (key: string) => void | Promise<void>;
};

function IconSidebarPanelCollapse() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="3" y="3.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M7.25 6.25v5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="3" width="6" height="6" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="4" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="9" width="6" height="8" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconFiles() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3 4.5A1.5 1.5 0 014.5 3h3.67a1 1 0 01.7.3L10.3 4.7a1 1 0 00.7.3h4.5A1.5 1.5 0 0117 6.5v9A1.5 1.5 0 0115.5 17h-11A1.5 1.5 0 013 15.5v-11z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 8l3 2.5L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 13h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconLogs() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M6 6h8M6 10h8M6 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3" y="3" width="14" height="14" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconAiModels() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="5" y="5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="8" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 2.5v2.5M12 2.5v2.5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SidebarContent(props: SidebarContentProps & { showTerminal?: boolean }) {
  const {
    onCollapse,
    onNewSession,
    profiles,
    profilesLoading,
    profilesCreating,
    profileDeletingId,
    selectedProfileId,
    hostProfileId,
    profileMenuOpen,
    onProfileMenuOpenChange,
    onSelectProfile,
    onCreateProfile,
    onCloneProfile,
    onDeleteProfile,
    sessions,
    loading,
    currentSessionKey,
    onSelectSession,
    onDeleteSession,
    showTerminal,
  } = props;

  return (
    <>
      <div className={css.UiChatSidebarHeader}>
        <Brand />
        <button
          type="button"
          className={css.UiChatSidebarToggle}
          aria-label="Collapse sidebar"
          onClick={onCollapse}
        >
          <IconSidebarPanelCollapse />
        </button>
      </div>

      <div className={css.UiChatSidebarBody}>
        <div
          onClick={onNewSession}
          className={css.UiChatSidebarNavLink}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onNewSession();
            }
          }}
        >
          <span className={`${css.UiChatSidebarSettingsIcon} ${css.UiChatSidebarNarrowNewIcon}`} aria-hidden="true">
            <IconPlus />
          </span>
          <span className={css.UiChatSidebarNavLabel}>New chat</span>
        </div>
        <ProfileSidebarSelector
          profiles={profiles}
          selectedProfileId={selectedProfileId}
          hostProfileId={hostProfileId}
          loading={profilesLoading}
          creating={profilesCreating}
          deletingProfileId={profileDeletingId}
          open={profileMenuOpen}
          onOpenChange={onProfileMenuOpenChange}
          onSelectProfile={onSelectProfile}
          onCreateProfile={onCreateProfile}
          onCloneProfile={onCloneProfile}
          onDeleteProfile={onDeleteProfile}
        />
      </div>

      <div className={css.UiChatSidebarSessions}>
        <h2 className={css.UiChatSidebarSessionsTitle}>Chats</h2>
        {loading ? (
          <div className={css.UiChatSidebarSubtitle}>Loading...</div>
        ) : (
          <ul className={css.UiChatSidebarSessionList} role="list">
            {!sessions.length && (
              <div className={css.UiChatSidebarSubtitle}>No chats yet</div>
            )}
            {sessions.map((s) => (
              <SessionSidebarItem
                key={s.key}
                sessionKey={s.key}
                title={s.title}
                isActive={currentSessionKey != null && currentSessionKey === s.key}
                onSelect={() => onSelectSession(s.key)}
                onDelete={onDeleteSession}
              />
            ))}
          </ul>
        )}
      </div>

      <div className={css.UiChatSidebarFooter}>
        <NavLink to={routes.dashboard} className={css.UiChatSidebarSettings} aria-label="Dashboard">
          <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
            <IconDashboard />
          </span>
          <span className={css.UiChatSidebarNavLabel}>Dashboard</span>
        </NavLink>
        {showTerminal && (
          <NavLink to={routes.terminal} className={css.UiChatSidebarSettings} aria-label="Terminal">
            <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
              <IconTerminal />
            </span>
            <span className={css.UiChatSidebarNavLabel}>Terminal</span>
          </NavLink>
        )}
        <NavLink to={routes.files} className={css.UiChatSidebarSettings} aria-label="Files">
          <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
            <IconFiles />
          </span>
          <span className={css.UiChatSidebarNavLabel}>Files</span>
        </NavLink>
        <NavLink to={routes.logs} className={css.UiChatSidebarSettings} aria-label="Logs">
          <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
            <IconLogs />
          </span>
          <span className={css.UiChatSidebarNavLabel}>Logs</span>
        </NavLink>
        <NavLink to={routes.settingsSkills} className={css.UiChatSidebarSettings} aria-label="Skills">
          <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 1.667l2.245 4.549 5.022.731-3.634 3.542.858 5.002L10 13.175l-4.491 2.316.858-5.002L2.733 6.947l5.022-.731L10 1.667z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className={css.UiChatSidebarNavLabel}>Skills</span>
        </NavLink>
        <NavLink to={routes.settingsModels} className={css.UiChatSidebarSettings} aria-label="AI Models">
          <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
            <IconAiModels />
          </span>
          <span className={css.UiChatSidebarNavLabel}>AI Models</span>
        </NavLink>
        <NavLink to={routes.settings} className={css.UiChatSidebarSettings} aria-label="Settings">
          <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M7.82918 16.1427L8.31622 17.238C8.461 17.5641 8.69728 17.8412 8.99641 18.0356C9.29553 18.23 9.64464 18.3335 10.0014 18.3334C10.3582 18.3335 10.7073 18.23 11.0064 18.0356C11.3055 17.8412 11.5418 17.5641 11.6866 17.238L12.1736 16.1427C12.347 15.754 12.6386 15.43 13.007 15.2167C13.3776 15.0029 13.8064 14.9119 14.232 14.9566L15.4236 15.0834C15.7784 15.1209 16.1363 15.0547 16.4542 14.8929C16.7721 14.731 17.0361 14.4803 17.2144 14.1714C17.3928 13.8626 17.4779 13.5086 17.4591 13.1525C17.4404 12.7963 17.3187 12.4532 17.1088 12.1649L16.4033 11.1955C16.152 10.8477 16.0178 10.4291 16.0199 10.0001C16.0198 9.57224 16.1553 9.15537 16.407 8.80934L17.1125 7.8399C17.3224 7.55154 17.4441 7.20847 17.4628 6.85231C17.4816 6.49615 17.3966 6.1422 17.2181 5.83341C17.0398 5.52444 16.7758 5.27382 16.4579 5.11194C16.14 4.95005 15.7821 4.88386 15.4273 4.92138L14.2357 5.04823C13.8101 5.09292 13.3813 5.00185 13.0107 4.78804C12.6416 4.57362 12.3499 4.24788 12.1773 3.85749L11.6866 2.76212C11.5418 2.43606 11.3055 2.15901 11.0064 1.96458C10.7073 1.77015 10.3582 1.66669 10.0014 1.66675C9.64464 1.66669 9.29553 1.77015 8.99641 1.96458C8.69728 2.15901 8.461 2.43606 8.31622 2.76212L7.82918 3.85749C7.65662 4.24788 7.36491 4.57362 6.99585 4.78804C6.62519 5.00185 6.19641 5.09292 5.77085 5.04823L4.57548 4.92138C4.22075 4.88386 3.86276 4.95005 3.54491 5.11194C3.22705 5.27382 2.96299 5.52444 2.78474 5.83341C2.60625 6.1422 2.52122 6.49615 2.53996 6.85231C2.5587 7.20847 2.6804 7.55154 2.89029 7.8399L3.59585 8.80934C3.84747 9.15537 3.98296 9.57224 3.98288 10.0001C3.98296 10.4279 3.84747 10.8448 3.59585 11.1908L2.89029 12.1603C2.6804 12.4486 2.5587 12.7917 2.53996 13.1479C2.52122 13.504 2.60625 13.858 2.78474 14.1667C2.96317 14.4756 3.22726 14.726 3.54507 14.8879C3.86288 15.0498 4.22078 15.1161 4.57548 15.0788L5.76714 14.9519C6.1927 14.9072 6.62149 14.9983 6.99214 15.2121C7.36258 15.4259 7.65565 15.7517 7.82918 16.1427Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.99991 12.5001C11.3806 12.5001 12.4999 11.3808 12.4999 10.0001C12.4999 8.61937 11.3806 7.50008 9.99991 7.50008C8.6192 7.50008 7.49991 8.61937 7.49991 10.0001C7.49991 11.3808 8.6192 12.5001 9.99991 12.5001Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className={css.UiChatSidebarNavLabel}>Settings</span>
        </NavLink>
      </div>
    </>
  );
}
