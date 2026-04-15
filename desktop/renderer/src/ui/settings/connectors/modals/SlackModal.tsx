import React from "react";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { patchConfig } from "../../../../services/api";

type GroupPolicy = "open" | "allowlist" | "disabled";
type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";

export function SlackModal(props: {
  port: number;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { port, isConnected, onConnected, onDisabled } = props;
  const [botToken, setBotToken] = React.useState("");
  const [appToken, setAppToken] = React.useState("");
  const [groupPolicy, setGroupPolicy] = React.useState<GroupPolicy>("allowlist");
  const [channelsRaw, setChannelsRaw] = React.useState("#general");
  const [dmPolicy, setDmPolicy] = React.useState<DmPolicy>("pairing");
  const [dmAllowFromRaw, setDmAllowFromRaw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  const canSave = React.useMemo(() => {
    if (!isConnected && (!botToken.trim() || !appToken.trim())) return false;
    return true;
  }, [appToken, botToken, isConnected]);

  const handleSave = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Saving Slack configuration...");
    try {
      const env: Record<string, string> = {};
      if (botToken.trim()) env.SLACK_BOT_TOKEN = botToken.trim();
      if (appToken.trim()) env.SLACK_APP_TOKEN = appToken.trim();

      const config: Record<string, unknown> = {
        slack: {
          require_mention: groupPolicy !== "open",
          free_response_channels: groupPolicy === "allowlist" ? channelsRaw : "",
        },
      };

      await patchConfig(port, { env, config });
      setStatus("Slack configured.");
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [appToken, botToken, channelsRaw, groupPolicy, onConnected, port]);

  return (
    <div>
      <div className="UiSectionSubtitle">
        <p>
          Connect your Slack workspace via Socket Mode. See{" "}
          <a
            href="https://api.slack.com/apis/socket-mode"
            target="_blank"
            rel="noopener noreferrer"
          >
            Slack docs
          </a>{" "}
          for setup instructions.
        </p>
      </div>

      {error && <InlineError>{error}</InlineError>}
      {status && <div style={{ fontSize: 13, color: "#8e8e8e", margin: "8px 0" }}>{status}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
            Bot token (<code>xoxb-...</code>)
          </label>
          <TextInput
            type="password"
            value={botToken}
            onChange={setBotToken}
            placeholder={isConnected ? "••••••••  (leave empty to keep)" : "xoxb-..."}
            disabled={busy}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
            App token (<code>xapp-...</code>)
          </label>
          <TextInput
            type="password"
            value={appToken}
            onChange={setAppToken}
            placeholder={isConnected ? "••••••••  (leave empty to keep)" : "xapp-..."}
            disabled={busy}
          />
        </div>

        {/* Channel policy */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
            Channel access policy
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            {(["allowlist", "open", "disabled"] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={busy}
                onClick={() => setGroupPolicy(p)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 4,
                  border: "1px solid var(--color-border, #333)",
                  background: groupPolicy === p ? "var(--color-accent, #4f6ef7)" : "transparent",
                  color: groupPolicy === p ? "#fff" : "inherit",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {groupPolicy === "allowlist" && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
              Allowed channels (comma-separated)
            </label>
            <textarea
              rows={2}
              disabled={busy}
              value={channelsRaw}
              onChange={(e) => setChannelsRaw(e.target.value)}
              placeholder="#general, C123..."
              style={{
                width: "100%",
                resize: "vertical",
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                fontSize: 12,
                padding: 8,
                borderRadius: 6,
                border: "1px solid var(--color-border, #333)",
                background: "var(--color-surface, #111)",
                color: "inherit",
              }}
            />
          </div>
        )}

        {/* DM policy */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
            DM policy
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            {(["pairing", "allowlist", "open", "disabled"] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={busy}
                onClick={() => setDmPolicy(p)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 4,
                  border: "1px solid var(--color-border, #333)",
                  background: dmPolicy === p ? "var(--color-accent, #4f6ef7)" : "transparent",
                  color: dmPolicy === p ? "#fff" : "inherit",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {(dmPolicy === "allowlist" || dmPolicy === "open") && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
              DM allowFrom (user IDs, comma-separated)
            </label>
            <textarea
              rows={2}
              disabled={busy}
              value={dmAllowFromRaw}
              onChange={(e) => setDmAllowFromRaw(e.target.value)}
              placeholder="@alice, U12345678"
              style={{
                width: "100%",
                resize: "vertical",
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                fontSize: 12,
                padding: 8,
                borderRadius: 6,
                border: "1px solid var(--color-border, #333)",
                background: "var(--color-surface, #111)",
                color: "inherit",
              }}
            />
          </div>
        )}

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
            Disable Slack
          </button>
        </div>
      )}
    </div>
  );
}
