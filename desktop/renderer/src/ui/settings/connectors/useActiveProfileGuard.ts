import React from "react";
import { fetchProfiles, selectProfile } from "../../../services/profile-api";
import {
  getSelectedHermesProfile,
  setSelectedHermesProfile,
} from "../../../services/request-context";

export type ActiveProfileGuard = {
  loading: boolean;
  selectedProfileId: string | null;
  hostProfileId: string | null;
  isOnHostProfile: boolean;
  switching: boolean;
  switchError: string | null;
  switchToHost: () => Promise<void>;
};

/**
 * Messenger platforms (Telegram, Discord, Slack, ...) are launched by the
 * main gateway process and read credentials from the host profile's env only.
 * Non-host profiles can write tokens to their own .env via the profile
 * worker, but no adapter is ever spawned for them — so the bot never comes
 * online. This hook exposes that state so UI can warn the user and offer a
 * one-click switch back to the host profile.
 */
export function useActiveProfileGuard(port: number): ActiveProfileGuard {
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [host, setHost] = React.useState<string | null>(null);
  const [switching, setSwitching] = React.useState(false);
  const [switchError, setSwitchError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetchProfiles(port);
      // Mirror Sidebar.loadProfiles fallback: backend only knows about
      // clients that explicitly called /api/profiles/session/select this
      // session. Fresh page loads restore the selection from localStorage
      // via the X-Hermes-Profile header, but `selectedProfile` in the
      // response stays null until the user clicks the dropdown. Without
      // this fallback the lock would never engage.
      const resolvedSelected =
        res.selectedProfile ||
        getSelectedHermesProfile() ||
        res.hostProfile ||
        res.profiles?.[0]?.id ||
        null;
      setSelected(resolvedSelected);
      setHost(res.hostProfile ?? null);
    } catch {
      // Silent fallback: treat as host profile so we don't block UX on transient errors.
    } finally {
      setLoading(false);
    }
  }, [port]);

  React.useEffect(() => {
    void load();
    const handler = () => void load();
    document.addEventListener("hermes-config-changed", handler);
    return () => document.removeEventListener("hermes-config-changed", handler);
  }, [load]);

  const switchToHost = React.useCallback(async () => {
    if (!host || switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      await selectProfile(port, host);
      setSelectedHermesProfile(host);
      setSelected(host);
      document.dispatchEvent(new Event("hermes-config-changed"));
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Failed to switch profile");
    } finally {
      setSwitching(false);
    }
  }, [host, port, switching]);

  const isOnHostProfile = !host || !selected || selected === host;

  return {
    loading,
    selectedProfileId: selected,
    hostProfileId: host,
    isOnHostProfile,
    switching,
    switchError,
    switchToHost,
  };
}
