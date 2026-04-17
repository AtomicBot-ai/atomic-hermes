import { getConfig, patchConfig } from "./api";

export const COMPUTER_USE_MCP_SERVER_NAME = "computer-use";

export function getDefaultComputerUseMcpServerConfig(): Record<string, unknown> {
  return {
    command: "npx",
    args: ["@atomicbotai/computer-use-mcp"],
    env: {
      COMPUTER_USE_OVERLAY_ENABLED: "1",
      COMPUTER_USE_OVERLAY_LABEL: "Atomic Hermes",
      COMPUTER_USE_OVERLAY_COLOR: "ff9100",
    },
  };
}

function hasComputerUseServer(config: Record<string, unknown>): boolean {
  const mcp = config.mcp_servers;
  if (!mcp || typeof mcp !== "object" || Array.isArray(mcp)) {
    return false;
  }
  const entry = (mcp as Record<string, unknown>)[COMPUTER_USE_MCP_SERVER_NAME];
  return Boolean(entry && typeof entry === "object" && !Array.isArray(entry));
}

/**
 * Ensures the default computer-use MCP server is registered for the given profile.
 * Skips if the server already exists. Intended to be fire-and-forget after profile creation.
 * Always pass profileId so config writes are not affected by localStorage races after loadProfiles().
 */
export async function seedComputerUseMcpIfMissing(port: number, profileId: string): Promise<void> {
  const id = profileId.trim();
  if (!id) {
    return;
  }
  try {
    const snap = await getConfig(port, id);
    const cfg = snap.config;
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
      return;
    }
    if (hasComputerUseServer(cfg as Record<string, unknown>)) {
      return;
    }
    await patchConfig(
      port,
      {
        config: {
          mcp_servers: {
            [COMPUTER_USE_MCP_SERVER_NAME]: getDefaultComputerUseMcpServerConfig(),
          },
        },
      },
      id,
    );
  } catch (err) {
    console.warn("seedComputerUseMcpIfMissing: failed", err);
  }
}
