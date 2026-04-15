import React from "react";

import { patchConfig, type ConfigResponse } from "../../../services/api";
import type { McpServerEntry, McpServerFormData } from "./types";

function getObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseServers(config: unknown): McpServerEntry[] {
  const cfg = getObject(config);
  const servers = getObject(cfg.mcp_servers);

  return Object.entries(servers)
    .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
    .map(([name, v]) => ({ name, config: v as Record<string, unknown> }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formDataToConfig(data: McpServerFormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (data.transportType === "stdio") {
    if (data.command) result.command = data.command;
    if (data.args && data.args.length > 0) result.args = data.args;
    if (data.env && Object.keys(data.env).length > 0) result.env = data.env;
    if (data.cwd) result.cwd = data.cwd;
  } else {
    if (data.url) result.url = data.url;
    if (data.transport) result.transport = data.transport;
    if (data.headers && Object.keys(data.headers).length > 0) result.headers = data.headers;
  }

  if (data.connectionTimeoutMs != null && data.connectionTimeoutMs > 0) {
    result.connectionTimeoutMs = data.connectionTimeoutMs;
  }

  return result;
}

function configToFormData(name: string, config: Record<string, unknown>): McpServerFormData {
  const hasUrl = typeof config.url === "string" && (config.url as string).trim().length > 0;
  const transportType = hasUrl ? "http" : ("stdio" as const);

  const data: McpServerFormData = { name, transportType };

  if (transportType === "stdio") {
    if (typeof config.command === "string") data.command = config.command;
    if (Array.isArray(config.args)) data.args = config.args.map(String);
    if (config.env && typeof config.env === "object" && !Array.isArray(config.env)) {
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(config.env as Record<string, unknown>)) {
        env[k] = String(v);
      }
      data.env = env;
    }
    if (typeof config.cwd === "string") data.cwd = config.cwd;
    if (typeof config.workingDirectory === "string" && !data.cwd) data.cwd = config.workingDirectory;
  } else {
    if (typeof config.url === "string") data.url = config.url;
    if (config.transport === "sse" || config.transport === "streamable-http") {
      data.transport = config.transport;
    }
    if (config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(config.headers as Record<string, unknown>)) {
        headers[k] = String(v);
      }
      data.headers = headers;
    }
  }

  if (typeof config.connectionTimeoutMs === "number" && config.connectionTimeoutMs > 0) {
    data.connectionTimeoutMs = config.connectionTimeoutMs;
  }

  return data;
}

export function useMcpServers(props: {
  port: number;
  configSnap: ConfigResponse | null;
  reload: () => Promise<void>;
}) {
  const { port, configSnap, reload } = props;
  const [servers, setServers] = React.useState<McpServerEntry[]>(() =>
    parseServers(configSnap?.config),
  );

  React.useEffect(() => {
    if (!configSnap) return;
    setServers(parseServers(configSnap.config));
  }, [configSnap]);

  const addOrUpdateServer = React.useCallback(
    async (data: McpServerFormData) => {
      const serverConfig = formDataToConfig(data);
      await patchConfig(port, {
        config: { mcp_servers: { [data.name]: serverConfig } },
      });
    },
    [port],
  );

  const removeServer = React.useCallback(
    async (name: string) => {
      await patchConfig(port, { config: { mcp_servers: { [name]: null } } });
    },
    [port],
  );

  const addOrUpdateServersRaw = React.useCallback(
    async (entries: Array<{ name: string; config: Record<string, unknown> }>) => {
      const patch: Record<string, Record<string, unknown>> = {};
      for (const entry of entries) {
        patch[entry.name] = entry.config;
      }
      await patchConfig(port, { config: { mcp_servers: patch } });
    },
    [port],
  );

  const refresh = React.useCallback(async () => {
    await reload();
  }, [reload]);

  return {
    servers,
    addOrUpdateServer,
    addOrUpdateServersRaw,
    removeServer,
    refresh,
    configToFormData,
  };
}
