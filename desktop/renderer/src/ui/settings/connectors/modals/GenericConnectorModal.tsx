import React from "react";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { patchConfig } from "../../../../services/api";
import type { PlatformStatus } from "../../../../services/messengers-api";

const ENV_LABELS: Record<string, { label: string; placeholder: string; password: boolean }> = {
  TELEGRAM_BOT_TOKEN: { label: "Bot Token", placeholder: "Paste bot token", password: true },
  DISCORD_BOT_TOKEN: { label: "Bot Token", placeholder: "Paste bot token", password: true },
  SLACK_BOT_TOKEN: { label: "Bot Token (xoxb-...)", placeholder: "xoxb-...", password: true },
  SLACK_APP_TOKEN: { label: "App Token (xapp-...)", placeholder: "xapp-...", password: true },
  SIGNAL_HTTP_URL: { label: "Signal CLI HTTP URL", placeholder: "http://localhost:8080", password: false },
  SIGNAL_ACCOUNT: { label: "Signal Account (phone)", placeholder: "+1234567890", password: false },
  WHATSAPP_ENABLED: { label: "Enable WhatsApp", placeholder: "true", password: false },
  WHATSAPP_MODE: { label: "WhatsApp Mode", placeholder: "self-chat", password: false },
  MATRIX_HOMESERVER: { label: "Homeserver URL", placeholder: "https://matrix.org", password: false },
  MATRIX_ACCESS_TOKEN: { label: "Access Token", placeholder: "syt_...", password: true },
  MATRIX_PASSWORD: { label: "Password", placeholder: "Password (alternative to token)", password: true },
  MATRIX_USER_ID: { label: "User ID", placeholder: "@bot:matrix.org", password: false },
  EMAIL_ADDRESS: { label: "Email Address", placeholder: "bot@example.com", password: false },
  EMAIL_PASSWORD: { label: "Email Password", placeholder: "App password", password: true },
  EMAIL_IMAP_HOST: { label: "IMAP Host", placeholder: "imap.gmail.com", password: false },
  EMAIL_SMTP_HOST: { label: "SMTP Host", placeholder: "smtp.gmail.com", password: false },
  HASS_TOKEN: { label: "Home Assistant Token", placeholder: "Long-lived access token", password: true },
  HASS_URL: { label: "Home Assistant URL", placeholder: "http://homeassistant.local:8123", password: false },
  TWILIO_ACCOUNT_SID: { label: "Account SID", placeholder: "AC...", password: false },
  TWILIO_AUTH_TOKEN: { label: "Auth Token", placeholder: "Auth token", password: true },
  TWILIO_PHONE_NUMBER: { label: "Phone Number", placeholder: "+1234567890", password: false },
  DINGTALK_CLIENT_ID: { label: "Client ID", placeholder: "DingTalk client ID", password: false },
  DINGTALK_CLIENT_SECRET: { label: "Client Secret", placeholder: "DingTalk client secret", password: true },
  FEISHU_APP_ID: { label: "App ID", placeholder: "Feishu app ID", password: false },
  FEISHU_APP_SECRET: { label: "App Secret", placeholder: "Feishu app secret", password: true },
  FEISHU_VERIFICATION_TOKEN: { label: "Verification Token", placeholder: "Optional", password: true },
  MATTERMOST_TOKEN: { label: "Bot Token", placeholder: "Mattermost bot token", password: true },
  MATTERMOST_URL: { label: "Server URL", placeholder: "https://mattermost.example.com", password: false },
  BLUEBUBBLES_SERVER_URL: { label: "Server URL", placeholder: "http://localhost:1234", password: false },
  BLUEBUBBLES_PASSWORD: { label: "Password", placeholder: "BlueBubbles password", password: true },
};

function getEnvMeta(key: string) {
  return ENV_LABELS[key] ?? { label: key, placeholder: key, password: key.toLowerCase().includes("token") || key.toLowerCase().includes("secret") || key.toLowerCase().includes("password") };
}

export function GenericConnectorModal(props: {
  port: number;
  platformId: string;
  platformInfo: PlatformStatus | null;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { port, platformId, platformInfo, isConnected, onConnected, onDisabled } = props;
  const allEnv = React.useMemo(() => {
    const required = platformInfo?.requiredEnv ?? [];
    const optional = platformInfo?.optionalEnv ?? [];
    return [...required, ...optional];
  }, [platformInfo]);

  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(allEnv.map((k) => [k, ""])),
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  const requiredKeys = platformInfo?.requiredEnv ?? [];
  const canSave = React.useMemo(() => {
    if (isConnected) return true;
    return requiredKeys.every((k) => (values[k] ?? "").trim().length > 0);
  }, [isConnected, requiredKeys, values]);

  const handleSave = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Saving configuration...");
    try {
      const env: Record<string, string> = {};
      for (const [key, val] of Object.entries(values)) {
        if (val.trim()) env[key] = val.trim();
      }
      await patchConfig(port, { env });
      setStatus("Configuration saved.");
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [onConnected, port, values]);

  if (!platformInfo) {
    return <div style={{ color: "#8e8e8e", padding: 16 }}>Platform information not available.</div>;
  }

  return (
    <div>
      <div className="UiSectionSubtitle">
        <p>{platformInfo.description}</p>
        {platformInfo.externalDep && (
          <p style={{ marginTop: 8 }}>
            <strong>Note:</strong> This platform requires {platformInfo.externalDep} to be installed separately.
          </p>
        )}
      </div>

      {error && <InlineError>{error}</InlineError>}
      {status && <div style={{ fontSize: 13, color: "#8e8e8e", margin: "8px 0" }}>{status}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {allEnv.map((envKey) => {
          const meta = getEnvMeta(envKey);
          const isRequired = requiredKeys.includes(envKey);
          return (
            <div key={envKey}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                {meta.label}
                {isRequired && <span style={{ color: "var(--color-danger, #e55)" }}> *</span>}
              </label>
              <TextInput
                type={meta.password ? "password" : "text"}
                value={values[envKey] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [envKey]: v }))}
                placeholder={isConnected ? `••••••••  (leave empty to keep)` : meta.placeholder}
                disabled={busy}
              />
            </div>
          );
        })}

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
            Disable {platformInfo.name}
          </button>
        </div>
      )}
    </div>
  );
}
