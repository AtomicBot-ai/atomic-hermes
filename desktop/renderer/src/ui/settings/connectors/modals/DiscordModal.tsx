import React from "react";
import { ActionButton, InlineError, TextInput, UiCheckbox } from "@shared/kit";
import { patchConfig } from "../../../../services/api";

export function DiscordModal(props: {
  port: number;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { port, isConnected, onConnected, onDisabled } = props;
  const [botToken, setBotToken] = React.useState("");
  const [requireMention, setRequireMention] = React.useState(true);
  const [allowedChannels, setAllowedChannels] = React.useState("");
  const [allowedUsers, setAllowedUsers] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  const canSave = React.useMemo(() => {
    if (!isConnected && !botToken.trim()) return false;
    return true;
  }, [botToken, isConnected]);

  const handleSave = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Saving Discord configuration...");
    try {
      const env: Record<string, string> = {};
      if (botToken.trim()) env.DISCORD_BOT_TOKEN = botToken.trim();
      if (allowedChannels.trim()) env.DISCORD_ALLOWED_CHANNELS = allowedChannels.trim();
      if (allowedUsers.trim()) env.DISCORD_ALLOWED_USERS = allowedUsers.trim();

      const config: Record<string, unknown> = {
        discord: {
          require_mention: requireMention,
        },
      };

      await patchConfig(port, { env, config });
      setStatus("Discord configured.");
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [allowedChannels, allowedUsers, botToken, onConnected, port, requireMention]);

  return (
    <div>
      <div className="UiSectionSubtitle">
        <p>
          Connect your Discord bot.{" "}
          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create a bot in the Discord Developer Portal
          </a>.
        </p>
      </div>

      {error && <InlineError>{error}</InlineError>}
      {status && <div style={{ fontSize: 13, color: "#8e8e8e", margin: "8px 0" }}>{status}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
            Bot token
          </label>
          <TextInput
            type="password"
            value={botToken}
            onChange={setBotToken}
            placeholder={isConnected ? "••••••••  (leave empty to keep)" : "Paste bot token here"}
            disabled={busy}
          />
        </div>

        <UiCheckbox
          checked={requireMention}
          label="Require @mention to respond in channels"
          onChange={setRequireMention}
        />

        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
            Allowed channels (comma-separated, empty = all)
          </label>
          <TextInput
            value={allowedChannels}
            onChange={setAllowedChannels}
            placeholder="general, bot-chat"
            disabled={busy}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
            Allowed users (comma-separated, empty = all)
          </label>
          <TextInput
            value={allowedUsers}
            onChange={setAllowedUsers}
            placeholder="user123, user456"
            disabled={busy}
          />
        </div>

        <ActionButton
          variant="primary"
          disabled={busy || !canSave}
          onClick={() => void handleSave()}
        >
          {busy ? "Saving..." : isConnected ? "Update" : "Connect"}
        </ActionButton>
      </div>

      {isConnected && (
        <div style={{ marginTop: 20, borderTop: "1px solid var(--color-border, #333)", paddingTop: 12 }}>
          <button
            type="button"
            disabled={busy}
            onClick={onDisabled}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-danger, #e55)",
              cursor: "pointer",
              fontSize: 13,
              padding: 0,
            }}
          >
            Disable Discord
          </button>
        </div>
      )}
    </div>
  );
}
