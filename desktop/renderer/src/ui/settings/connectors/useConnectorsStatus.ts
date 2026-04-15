import React from "react";
import {
  fetchMessengersStatus,
  installMessengerDeps,
  type PlatformStatus,
} from "../../../services/messengers-api";
import type { ConnectorId } from "./connector-definitions";

export type ConnectorStatus =
  | "connect"
  | "connected"
  | "disabled"
  | "needs-deps"
  | "installing"
  | "coming-soon";

export function useConnectorsStatus(port: number) {
  const [platforms, setPlatforms] = React.useState<PlatformStatus[]>([]);
  const [statuses, setStatuses] = React.useState<Record<string, ConnectorStatus>>({});
  const [installing, setInstalling] = React.useState<string | null>(null);
  const [installError, setInstallError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const deriveStatuses = React.useCallback((items: PlatformStatus[]): Record<string, ConnectorStatus> => {
    const result: Record<string, ConnectorStatus> = {};
    for (const p of items) {
      if (!p.depsInstalled && p.pipExtra) {
        result[p.id] = "needs-deps";
      } else if (p.running) {
        result[p.id] = "connected";
      } else if (p.configured) {
        result[p.id] = "disabled";
      } else {
        result[p.id] = "connect";
      }
    }
    return result;
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      setLoadError(null);
      const data = await fetchMessengersStatus(port);
      setPlatforms(data.platforms);
      setStatuses(deriveStatuses(data.platforms));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load messenger status");
    } finally {
      setLoading(false);
    }
  }, [port, deriveStatuses]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const markConnected = React.useCallback((id: ConnectorId) => {
    setStatuses((prev) => ({ ...prev, [id]: "connected" }));
  }, []);

  const markDisabled = React.useCallback((id: ConnectorId) => {
    setStatuses((prev) => ({ ...prev, [id]: "disabled" }));
  }, []);

  const installDeps = React.useCallback(
    async (platformId: string) => {
      setInstalling(platformId);
      setInstallError(null);
      setStatuses((prev) => ({ ...prev, [platformId]: "installing" }));
      try {
        const result = await installMessengerDeps(port, platformId);
        if (result.ok) {
          await refresh();
        } else {
          setInstallError(result.error || "Installation failed");
          setStatuses((prev) => ({ ...prev, [platformId]: "needs-deps" }));
        }
      } catch (err) {
        setInstallError(err instanceof Error ? err.message : "Installation failed");
        setStatuses((prev) => ({ ...prev, [platformId]: "needs-deps" }));
      } finally {
        setInstalling(null);
      }
    },
    [port, refresh],
  );

  const getPlatformInfo = React.useCallback(
    (id: string): PlatformStatus | undefined => platforms.find((p) => p.id === id),
    [platforms],
  );

  return {
    statuses,
    loading,
    loadError,
    installing,
    installError,
    setInstallError,
    markConnected,
    markDisabled,
    refresh,
    installDeps,
    getPlatformInfo,
  };
}
