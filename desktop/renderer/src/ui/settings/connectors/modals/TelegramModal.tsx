import React from "react";
import { ActionButton, InlineError } from "@shared/kit";
import { getConfig, patchConfig } from "../../../../services/api";

type SetupStep = "token" | "allowlist" | null;

export function TelegramModal(props: {
  port: number;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { port, isConnected, onConnected, onDisabled } = props;
  const [botToken, setBotToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [hasExistingToken, setHasExistingToken] = React.useState(false);
  const [setupStep, setSetupStep] = React.useState<SetupStep>(null);
  const [allowList, setAllowList] = React.useState<string[]>([]);
  const [newId, setNewId] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getConfig(port);
        if (cancelled) return;
        const providers = snap.providers ?? [];
        const hasTg = providers.some(
          (p) => p.envVar === "TELEGRAM_BOT_TOKEN" && p.configured,
        );
        if (hasTg) {
          setHasExistingToken(true);
        } else {
          setSetupStep("token");
        }
        const allowed = (snap.config as Record<string, unknown>)?.telegram_allowed_users;
        if (typeof allowed === "string" && allowed.trim()) {
          setAllowList(allowed.split(",").map((s) => s.trim()).filter(Boolean));
        }
      } catch {
        // Best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [port]);

  const handleSaveToken = React.useCallback(async () => {
    const token = botToken.trim();
    if (!token && !isConnected) {
      setError("Bot token is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Saving Telegram bot token...");
    try {
      const env: Record<string, string> = {};
      if (token) env.TELEGRAM_BOT_TOKEN = token;
      await patchConfig(port, { env });
      setStatus("Bot token saved.");
      setBotToken("");
      setHasExistingToken(true);

      if (setupStep === "token") {
        setSetupStep("allowlist");
        setError(null);
        setStatus(null);
      } else {
        onConnected();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save token");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [botToken, isConnected, onConnected, port, setupStep]);

  const handleAddId = React.useCallback(async () => {
    const id = newId.trim().replace(/^(telegram|tg):/i, "").trim();
    if (!id) return;
    if (allowList.includes(id)) {
      setError(`"${id}" is already in the allowlist.`);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Adding to allowlist...");
    try {
      const merged = [...allowList, id];
      await patchConfig(port, {
        env: { TELEGRAM_ALLOWED_USERS: merged.join(",") },
      });
      setAllowList(merged);
      setNewId("");
      setStatus(`Added ${id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add ID");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [allowList, newId, port]);

  const handleRemoveId = React.useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const filtered = allowList.filter((v) => v !== id);
        await patchConfig(port, {
          env: { TELEGRAM_ALLOWED_USERS: filtered.join(",") },
        });
        setAllowList(filtered);
        setStatus(`Removed ${id}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove");
        setStatus(null);
      } finally {
        setBusy(false);
      }
    },
    [allowList, port],
  );

  const handleDone = React.useCallback(() => {
    const pending = newId.trim();
    if (pending && !allowList.includes(pending)) {
      void (async () => {
        setBusy(true);
        try {
          const merged = [...allowList, pending];
          await patchConfig(port, {
            env: { TELEGRAM_ALLOWED_USERS: merged.join(",") },
          });
          setAllowList(merged);
          setNewId("");
        } catch {
          // Best-effort
        } finally {
          setBusy(false);
          onConnected();
        }
      })();
    } else {
      onConnected();
    }
  }, [allowList, newId, onConnected, port]);

  return (
    <div>
      <div className="UiSectionSubtitle">
        {setupStep === "token" ? (
          <>
            <p>
              Get your bot token from Telegram.{" "}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
                Open @BotFather
              </a>
            </p>
            <ol style={{ paddingLeft: 20, marginTop: 8, lineHeight: 1.6 }}>
              <li>Open Telegram and go to <strong>@BotFather</strong></li>
              <li>Start a chat and type <strong>/newbot</strong></li>
              <li>Follow the prompts to name your bot</li>
              <li>Copy the token and paste it below</li>
            </ol>
          </>
        ) : setupStep === "allowlist" ? (
          <p>Bot connected! Now add your Telegram user ID to the allowlist.</p>
        ) : (
          <p>
            Configure your Telegram bot. Get a token from{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
              @BotFather
            </a>.
          </p>
        )}
      </div>

      {error && <InlineError>{error}</InlineError>}
      {status && <div style={{ fontSize: 13, color: "#8e8e8e", margin: "8px 0" }}>{status}</div>}

      {/* Token step */}
      {(setupStep === "token" || setupStep === null) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          <input
            className="UiInput"
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={hasExistingToken ? "••••••••  (leave empty to keep)" : "Paste bot token here"}
            disabled={busy}
            style={{ borderRadius: "var(--radius-lg, 8px)", background: "var(--surface-secondary, #1a1a2e)" }}
          />
          <ActionButton
            variant="primary"
            disabled={busy || (!botToken.trim() && !isConnected)}
            onClick={() => void handleSaveToken()}
          >
            {busy ? "Saving..." : hasExistingToken ? "Update Token" : "Connect"}
          </ActionButton>
        </div>
      )}

      {/* Allowlist step */}
      {(setupStep === "allowlist" || setupStep === null) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
            Allowed users (Telegram user IDs)
          </div>
          {allowList.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {allowList.map((id) => (
                <span
                  key={id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: "var(--surface-secondary, #1a1a2e)",
                    fontSize: 13,
                    lineHeight: "20px",
                  }}
                >
                  {id}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRemoveId(id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#8e8e8e",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 16,
                      lineHeight: 1,
                    }}
                    aria-label={`Remove ${id}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              className="UiInput"
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="Enter Telegram user ID"
              disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter" && newId.trim()) void handleAddId(); }}
              style={{ flex: 1, borderRadius: "var(--radius-lg, 8px)", background: "var(--surface-secondary, #1a1a2e)" }}
            />
            <button
              type="button"
              className="UiSecondaryButton"
              disabled={busy || !newId.trim()}
              onClick={() => void handleAddId()}
              style={{ flexShrink: 0 }}
            >
              Add
            </button>
          </div>
          {setupStep === "allowlist" && (
            <div style={{ marginTop: 16 }}>
              <ActionButton variant="primary" disabled={busy} onClick={handleDone}>
                Done
              </ActionButton>
            </div>
          )}
        </div>
      )}

      {/* Disable button for connected state */}
      {isConnected && setupStep === null && (
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
            Disable Telegram
          </button>
        </div>
      )}
    </div>
  );
}
