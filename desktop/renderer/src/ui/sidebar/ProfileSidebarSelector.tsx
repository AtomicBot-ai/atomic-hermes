import React from "react";
import { createPortal } from "react-dom";
import type { ProfileSummary } from "../../services/profile-api";
import css from "./Sidebar.module.css";

export type ProfileSidebarSelectorProps = {
  profiles: ProfileSummary[];
  selectedProfileId: string | null;
  loading: boolean;
  creating: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProfile: (profileId: string) => void | Promise<void>;
  onCreateProfile: (name: string) => void | Promise<void>;
  onCloneProfile: (name: string) => void | Promise<void>;
};

function buildProfileSubtitle(profile: ProfileSummary | null): string {
  if (!profile) return "Select a profile";
  const parts = [profile.isDefault ? "Default profile" : "Profile"];
  if (profile.model) parts.push(profile.model);
  if (profile.provider) parts.push(profile.provider);
  return parts.join(" · ");
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4.5 6.5L8 10l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 5.5V3.5a1.5 1.5 0 00-1.5-1.5H3.5A1.5 1.5 0 002 3.5V9a1.5 1.5 0 001.5 1.5h2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

type InlineInputMode = "create" | "clone" | null;

export function ProfileSidebarSelector(props: ProfileSidebarSelectorProps) {
  const {
    profiles,
    selectedProfileId,
    loading,
    creating,
    open,
    onOpenChange,
    onSelectProfile,
    onCreateProfile,
    onCloneProfile,
  } = props;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = React.useState<InlineInputMode>(null);
  const [inputValue, setInputValue] = React.useState("");
  const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties | null>(null);

  const selectedProfile = React.useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null,
    [profiles, selectedProfileId],
  );

  const updateDropdownPosition = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const viewportPadding = 12;
    const dropdownWidth = 350;
    const availableHeight = Math.max(220, window.innerHeight - rect.bottom - viewportPadding);
    const maxLeft = Math.max(viewportPadding, window.innerWidth - dropdownWidth - viewportPadding);
    setDropdownStyle({
      top: rect.bottom + 8,
      left: Math.min(rect.left, maxLeft),
      width: dropdownWidth,
      maxHeight: Math.min(420, availableHeight),
    });
  }, []);

  React.useEffect(() => {
    if (!open) {
      setInputMode(null);
      setInputValue("");
      setDropdownStyle(null);
      return;
    }

    updateDropdownPosition();

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      if (target && dropdownRef.current?.contains(target)) return;
      onOpenChange(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (inputMode) {
          setInputMode(null);
          setInputValue("");
        } else {
          onOpenChange(false);
        }
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [open, onOpenChange, inputMode, updateDropdownPosition]);

  React.useEffect(() => {
    if (inputMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputMode]);

  function handleInputSubmit() {
    const name = inputValue.trim();
    if (!name || creating) return;
    if (inputMode === "create") {
      void onCreateProfile(name);
    } else if (inputMode === "clone") {
      void onCloneProfile(name);
    }
    setInputMode(null);
    setInputValue("");
  }

  const dropdown = open && dropdownStyle && typeof document !== "undefined"
    ? createPortal(
      <div
        ref={dropdownRef}
        className={css.UiChatSidebarProfileDropdown}
        role="menu"
        aria-label="Profiles"
        style={dropdownStyle}
      >
        <div className={css.UiChatSidebarProfileDropdownTitle}>Profiles</div>
        <div className={css.UiChatSidebarProfileDropdownList}>
          {!profiles.length ? (
            <div className={css.UiChatSidebarProfileEmpty}>No profiles available</div>
          ) : (
            profiles.map((profile) => {
              const isActive = profile.id === selectedProfileId;
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  className={`${css.UiChatSidebarProfileOption}${isActive ? ` ${css.UiChatSidebarProfileOptionActive}` : ""}`}
                  onClick={() => {
                    void onSelectProfile(profile.id);
                    onOpenChange(false);
                  }}
                >
                  <span className={css.UiChatSidebarProfileAvatar} aria-hidden="true">
                    {profile.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className={css.UiChatSidebarProfileText}>
                    <span className={css.UiChatSidebarProfileTitle}>{profile.name}</span>
                    <span className={css.UiChatSidebarProfileSubtitle}>
                      {buildProfileSubtitle(profile)}
                    </span>
                  </span>
                  <span className={css.UiChatSidebarProfileMeta}>
                    {profile.gatewayRunning && <span className={css.UiChatSidebarProfileStatusDot} aria-hidden="true" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {inputMode ? (
          <div className={css.UiChatSidebarProfileInlineInput}>
            <span className={css.UiChatSidebarProfileInlineLabel}>
              {inputMode === "clone" ? "Clone as:" : "Profile name:"}
            </span>
            <form
              className={css.UiChatSidebarProfileInlineForm}
              onSubmit={(e) => { e.preventDefault(); handleInputSubmit(); }}
            >
              <input
                ref={inputRef}
                type="text"
                className={css.UiChatSidebarProfileInlineField}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g. coder"
                autoComplete="off"
                spellCheck={false}
                disabled={creating}
              />
              <button
                type="submit"
                className={css.UiChatSidebarProfileInlineSubmit}
                disabled={!inputValue.trim() || creating}
              >
                {creating ? "..." : "Create"}
              </button>
            </form>
          </div>
        ) : (
          <div className={css.UiChatSidebarProfileActions}>
            <button
              type="button"
              className={css.UiChatSidebarProfileAction}
              onClick={() => { setInputMode("create"); setInputValue(""); }}
              disabled={creating}
            >
              <span className={css.UiChatSidebarProfileActionIcon} aria-hidden="true">
                <PlusIcon />
              </span>
              <span>New Profile</span>
            </button>
            <button
              type="button"
              className={css.UiChatSidebarProfileAction}
              onClick={() => { setInputMode("clone"); setInputValue(""); }}
              disabled={creating}
            >
              <span className={css.UiChatSidebarProfileActionIcon} aria-hidden="true">
                <CloneIcon />
              </span>
              <span>Clone current</span>
            </button>
          </div>
        )}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={css.UiChatSidebarProfileRoot} ref={rootRef}>
      <button
        type="button"
        className={css.UiChatSidebarProfileTrigger}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpenChange(!open)}
      >
        <span className={css.UiChatSidebarProfileAvatar} aria-hidden="true">
          {selectedProfile?.name?.slice(0, 1).toUpperCase() || "P"}
        </span>
        <span className={css.UiChatSidebarProfileText}>
          <span className={css.UiChatSidebarProfileTitle}>
            {loading ? "Loading profiles..." : selectedProfile?.name || "Profiles"}
          </span>
          <span className={css.UiChatSidebarProfileSubtitle}>
            {loading ? "Fetching available profiles" : buildProfileSubtitle(selectedProfile)}
          </span>
        </span>
        <span className={css.UiChatSidebarProfileChevron} aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      {dropdown}
    </div>
  );
}
