import React from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useAppSelector } from "@store/hooks";
import { fetchSessions, deleteSession } from "../../services/session-api";
import { createProfile, fetchProfiles, selectProfile, type ProfileSummary } from "../../services/profile-api";
import { getSelectedHermesProfile, setSelectedHermesProfile } from "../../services/request-context";
import { useTerminalSidebarVisible } from "../shared/hooks/useTerminalSidebarVisible";
import { routes } from "../app/routes";
import { SidebarContent } from "./SidebarContent";
import css from "./Sidebar.module.css";

type SessionWithTitle = {
  key: string;
  title: string;
};

const SESSIONS_LIST_LIMIT = 50;
const TITLE_MAX_LEN = 48;

function IconSidebarPanelExpand() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="3" y="3.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M10.75 6.25v5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
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
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2.75" y="2.75" width="5.5" height="5.5" rx="1.15" stroke="currentColor" strokeWidth="1.25" />
      <rect x="9.75" y="2.75" width="5.5" height="3.75" rx="1.15" stroke="currentColor" strokeWidth="1.25" />
      <rect x="9.75" y="8.5" width="5.5" height="6.75" rx="1.15" stroke="currentColor" strokeWidth="1.25" />
      <rect x="2.75" y="9.75" width="5.5" height="5.5" rx="1.15" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function IconFiles() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M2.75 4A1.25 1.25 0 014 2.75h3.17a1 1 0 01.7.3L9.3 4.45a1 1 0 00.7.3H14A1.25 1.25 0 0115.25 6v8A1.25 1.25 0 0114 15.25H4A1.25 1.25 0 012.75 14V4z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2.25" y="3.25" width="13.5" height="11.5" rx="1.75" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5.5 7.25l2.5 2L5.5 11.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11.25h2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconLogs() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M5.25 5.25h7.5M5.25 9h7.5M5.25 12.75h4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="2.75" y="2.75" width="12.5" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export type SidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function Sidebar(props: SidebarProps) {
  const { open, onOpenChange } = props;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentSessionKey = searchParams.get("session") ?? null;
  const gatewayState = useAppSelector((s) => s.gateway.state);
  const port = gatewayState?.kind === "ready" ? gatewayState.port : 8642;
  const [showTerminal] = useTerminalSidebarVisible();

  const [profiles, setProfiles] = React.useState<ProfileSummary[]>([]);
  const [profilesLoading, setProfilesLoading] = React.useState(true);
  const [profilesCreating, setProfilesCreating] = React.useState(false);
  const [selectedProfileId, setSelectedProfileId] = React.useState<string | null>(
    () => getSelectedHermesProfile(),
  );
  const [profileMenuOpen, setProfileMenuOpen] = React.useState(false);
  const [sessions, setSessions] = React.useState<SessionWithTitle[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadProfiles = React.useCallback(
    async (background = false) => {
      if (!background) setProfilesLoading(true);
      try {
        const res = await fetchProfiles(port);
        const nextProfiles = res.profiles ?? [];
        const nextSelectedProfile =
          res.selectedProfile || getSelectedHermesProfile() || res.hostProfile || nextProfiles[0]?.id || null;
        setProfiles(nextProfiles);
        setSelectedProfileId(nextSelectedProfile);
        setSelectedHermesProfile(nextSelectedProfile);
      } catch (error) {
        console.error("Failed to load profiles:", error);
        if (!background) setProfiles([]);
      } finally {
        if (!background) setProfilesLoading(false);
      }
    },
    [port],
  );

  const loadSessions = React.useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      try {
        const res = await fetchSessions(port, SESSIONS_LIST_LIMIT);
        const withTitles: SessionWithTitle[] = (res.sessions ?? []).map((row) => {
          const raw = row.derivedTitle || row.label || row.lastMessagePreview || "";
          const title = raw
            ? raw.length > TITLE_MAX_LEN ? `${raw.slice(0, TITLE_MAX_LEN)}…` : raw
            : "New Chat";
          return { key: row.key, title };
        });
        setSessions(withTitles);
      } catch {
        if (!background) setSessions([]);
      } finally {
        if (!background) setLoading(false);
      }
    },
    [port, selectedProfileId],
  );

  React.useEffect(() => {
    void loadProfiles(false);
  }, [loadProfiles]);

  React.useEffect(() => {
    const handler = () => void loadProfiles(true);
    document.addEventListener("hermes-config-changed", handler);
    return () => document.removeEventListener("hermes-config-changed", handler);
  }, [loadProfiles]);

  const isInitialLoad = React.useRef(true);
  React.useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      void loadSessions(false);
      return;
    }
    void loadSessions(true);
  }, [currentSessionKey, loadSessions]);

  const handleNewSession = React.useCallback(() => {
    void navigate(routes.chat, { replace: true, state: { focusComposer: true } });
  }, [navigate]);

  const handleSelectProfile = React.useCallback(
    async (profileId: string) => {
      if (!profileId || profileId === selectedProfileId) {
        setProfileMenuOpen(false);
        return;
      }
      try {
        await selectProfile(port, profileId);
        setSelectedProfileId(profileId);
        setSelectedHermesProfile(profileId);
        setProfileMenuOpen(false);
        void navigate(routes.chat, { replace: true });
        void loadProfiles(true);
      } catch (error) {
        console.error("Failed to select profile:", error);
      }
    },
    [loadProfiles, navigate, port, selectedProfileId],
  );

  const finishProfileCreation = React.useCallback(
    async (created: Awaited<ReturnType<typeof createProfile>>) => {
      if (!created.ok || !created.profile?.id) {
        throw new Error(created.error || "Profile creation failed");
      }
      await selectProfile(port, created.profile.id);
      setSelectedProfileId(created.profile.id);
      setSelectedHermesProfile(created.profile.id);
      setProfileMenuOpen(false);
      toast.success(`Profile "${created.profile.id}" created`);
      void navigate(routes.chat, { replace: true });
      await loadProfiles(true);
    },
    [loadProfiles, navigate, port],
  );

  const handleCreateProfile = React.useCallback(async (name: string) => {
    if (profilesCreating) return;
    setProfilesCreating(true);
    try {
      const created = await createProfile(port, name);
      await finishProfileCreation(created);
    } catch (error) {
      console.error("Failed to create profile:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create profile");
    } finally {
      setProfilesCreating(false);
    }
  }, [finishProfileCreation, port, profilesCreating]);

  const handleCloneProfile = React.useCallback(async (name: string) => {
    if (profilesCreating || !selectedProfileId) return;
    setProfilesCreating(true);
    try {
      const created = await createProfile(port, name, {
        cloneFrom: selectedProfileId,
        cloneAll: true,
      });
      await finishProfileCreation(created);
    } catch (error) {
      console.error("Failed to clone profile:", error);
      toast.error(error instanceof Error ? error.message : "Failed to clone profile");
    } finally {
      setProfilesCreating(false);
    }
  }, [finishProfileCreation, port, profilesCreating, selectedProfileId]);

  const handleSelectSession = React.useCallback(
    (key: string) => {
      void navigate(`${routes.chat}?session=${encodeURIComponent(key)}`, { replace: true });
    },
    [navigate],
  );

  const handleDeleteSession = React.useCallback(
    async (key: string) => {
      try {
        await deleteSession(port, key);
        await loadSessions(true);
        if (currentSessionKey === key) {
          void navigate(routes.chat, { replace: true });
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [currentSessionKey, port, loadSessions, navigate],
  );

  const asideClass = `${css.UiChatSidebar}${open ? "" : ` ${css.UiChatSidebarClosed}`}`.trim();

  const handleClosedAsideClick = React.useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (open) return;
      const t = e.target as HTMLElement | null;
      if (!t || t.closest("button")) return;
      onOpenChange(true);
    },
    [open, onOpenChange],
  );

  return (
    <aside
      className={asideClass}
      data-open={open ? "true" : "false"}
      aria-label="Chat sessions"
      onClick={handleClosedAsideClick}
    >
      <div className={css.UiChatSidebarLayers}>
        <div
          className={`${css.UiChatSidebarLayer} ${css.UiChatSidebarNarrow}`}
          aria-hidden={open}
        >
          <div className={css.UiChatSidebarNarrowHeader}>
            <button
              type="button"
              className={css.UiChatSidebarToggle}
              aria-label="Expand sidebar"
              onClick={() => onOpenChange(true)}
            >
              <IconSidebarPanelExpand />
            </button>
          </div>
          <div className={css.UiChatSidebarNarrowBody}>
            <div
              onClick={handleNewSession}
              className={css.UiChatSidebarNarrowLink}
              role="button"
              tabIndex={0}
              title="New chat"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleNewSession();
                }
              }}
            >
              <span className={`${css.UiChatSidebarSettingsIcon} ${css.UiChatSidebarNarrowNewIcon}`} aria-hidden="true">
                <IconPlus />
              </span>
            </div>
          </div>
          <div className={css.UiChatSidebarNarrowFooter}>
            <NavLink
              to={routes.dashboard}
              className={css.UiChatSidebarNarrowFooterBtn}
              aria-label="Dashboard"
              title="Dashboard"
            >
              <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
                <IconDashboard />
              </span>
            </NavLink>
            {showTerminal && (
              <NavLink
                to={routes.terminal}
                className={css.UiChatSidebarNarrowFooterBtn}
                aria-label="Terminal"
                title="Terminal"
              >
                <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
                  <IconTerminal />
                </span>
              </NavLink>
            )}
            <NavLink
              to={routes.files}
              className={css.UiChatSidebarNarrowFooterBtn}
              aria-label="Files"
              title="Files"
            >
              <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
                <IconFiles />
              </span>
            </NavLink>
            <NavLink
              to={routes.logs}
              className={css.UiChatSidebarNarrowFooterBtn}
              aria-label="Logs"
              title="Logs"
            >
              <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
                <IconLogs />
              </span>
            </NavLink>
            <NavLink
              to={routes.settings}
              className={css.UiChatSidebarNarrowFooterBtn}
              aria-label="Settings"
              title="Settings"
            >
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
            </NavLink>
          </div>
        </div>

        <div
          className={`${css.UiChatSidebarLayer} ${css.UiChatSidebarWide}`}
          aria-hidden={!open}
        >
          <SidebarContent
            onCollapse={() => onOpenChange(false)}
            onNewSession={handleNewSession}
            profiles={profiles}
            profilesLoading={profilesLoading}
            profilesCreating={profilesCreating}
            selectedProfileId={selectedProfileId}
            profileMenuOpen={profileMenuOpen}
            onProfileMenuOpenChange={setProfileMenuOpen}
            onSelectProfile={handleSelectProfile}
            onCreateProfile={handleCreateProfile}
            onCloneProfile={handleCloneProfile}
            sessions={sessions}
            loading={loading}
            currentSessionKey={currentSessionKey}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            showTerminal={showTerminal}
          />
        </div>
      </div>
    </aside>
  );
}
