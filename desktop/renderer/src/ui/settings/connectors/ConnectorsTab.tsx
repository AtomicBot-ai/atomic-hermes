import React from "react";
import { settingsStyles as ps } from "../SettingsPage";
import { FeatureCta, Modal, ActionButton, InlineError, ConfirmDialog } from "@shared/kit";
import { useSettingsState } from "../settings-context";
import { patchConfig } from "../../../services/api";
import { restartGateway } from "../../../services/messengers-api";
import { useConnectorsStatus, type ConnectorStatus } from "./useConnectorsStatus";
import { CONNECTORS, resolveConnectorIconUrl, type ConnectorId } from "./connector-definitions";
import { TelegramModal } from "./modals/TelegramModal";
import { SlackModal } from "./modals/SlackModal";
import { DiscordModal } from "./modals/DiscordModal";
import { GenericConnectorModal } from "./modals/GenericConnectorModal";

export function ConnectorsTab() {
  const { port } = useSettingsState();
  const {
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
  } = useConnectorsStatus(port);

  const [activeModal, setActiveModal] = React.useState<ConnectorId | null>(null);
  const [restartPending, setRestartPending] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [installConfirm, setInstallConfirm] = React.useState<ConnectorId | null>(null);

  const handleConnect = React.useCallback((id: ConnectorId) => {
    const status = statuses[id];
    if (status === "needs-deps") {
      setInstallConfirm(id);
      return;
    }
    setActiveModal(id);
  }, [statuses]);

  const handleConnected = React.useCallback(
    (id: ConnectorId) => {
      markConnected(id);
      setActiveModal(null);
      setRestartPending(true);
      void refresh();
    },
    [markConnected, refresh],
  );

  const handleDisabled = React.useCallback(
    async (id: ConnectorId) => {
      setError(null);
      try {
        await patchConfig(port, {
          env: Object.fromEntries(
            (getPlatformInfo(id)?.requiredEnv ?? []).map((k) => [k, ""]),
          ),
        });
        markDisabled(id);
        setActiveModal(null);
        setRestartPending(true);
        void refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to disable");
      }
    },
    [port, getPlatformInfo, markDisabled, refresh],
  );

  const handleRestart = React.useCallback(async () => {
    setRestarting(true);
    setError(null);
    try {
      await restartGateway(port);
    } catch {
      // Expected: process exits before response completes
    }
    setRestartPending(false);
  }, [port]);

  const handleInstallConfirm = React.useCallback(async () => {
    if (!installConfirm) return;
    setInstallConfirm(null);
    await installDeps(installConfirm);
  }, [installConfirm, installDeps]);

  const resolveStatus = (id: ConnectorId): ConnectorStatus => {
    if (installing === id) return "installing";
    return statuses[id] ?? "connect";
  };

  const renderCta = (id: ConnectorId) => {
    const status = resolveStatus(id);

    if (status === "installing") {
      return (
        <span className="UiSkillStatus" aria-label="Installing">
          Installing...
        </span>
      );
    }

    if (status === "needs-deps") {
      return (
        <button
          className="UiSkillConnectButton"
          type="button"
          onClick={() => handleConnect(id)}
        >
          Install
        </button>
      );
    }

    return (
      <FeatureCta
        status={status === "connect" || status === "disabled" ? status : status === "connected" ? "connected" : "connect"}
        onConnect={() => handleConnect(id)}
        onSettings={() => setActiveModal(id)}
      />
    );
  };

  if (loading) {
    return (
      <div className={ps.UiSettingsContentInner}>
        <div className={ps.UiSettingsTabTitle}>Messengers</div>
        <div style={{ padding: "24px 0", color: "#8e8e8e", textAlign: "center" }}>
          Loading messenger status...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={ps.UiSettingsContentInner}>
        <div className={ps.UiSettingsTabTitle}>Messengers</div>
        <InlineError>{loadError}</InlineError>
        <div style={{ marginTop: 12 }}>
          <ActionButton variant="secondary" onClick={() => void refresh()}>
            Retry
          </ActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className={ps.UiSettingsContentInner}>
      <div className={ps.UiSettingsTabTitle}>Messengers</div>

      {error && <InlineError>{error}</InlineError>}
      {installError && (
        <InlineError>
          {installError}{" "}
          <button
            type="button"
            style={{ textDecoration: "underline", background: "none", border: "none", color: "inherit", cursor: "pointer" }}
            onClick={() => setInstallError(null)}
          >
            Dismiss
          </button>
        </InlineError>
      )}

      {restartPending && (
        <div style={{ padding: "8px 12px", margin: "0 0 12px", borderRadius: 8, background: "var(--color-surface-alt, #1a1a2e)", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ flex: 1, fontSize: 13 }}>
            Configuration changed. Restart gateway to apply.
          </span>
          <ActionButton
            variant="primary"
            disabled={restarting}
            onClick={() => void handleRestart()}
          >
            {restarting ? "Restarting..." : "Restart"}
          </ActionButton>
        </div>
      )}

      <div className="UiSkillsScroll" style={{ maxHeight: "none" }}>
        <div className="UiSkillsGrid">
          {CONNECTORS.map((connector) => {
            const iconUrl = resolveConnectorIconUrl(connector.svgIcon);
            return (
              <div
                key={connector.id}
                className="UiSkillCard"
                role="group"
                aria-label={connector.name}
              >
                <div className="UiSkillTopRow">
                  <span className="UiSkillIcon" aria-hidden="true">
                    {iconUrl ? (
                      <img src={iconUrl} alt="" />
                    ) : (
                      connector.iconEmoji
                    )}
                    {resolveStatus(connector.id) === "connected" && (
                      <span className="UiProviderTileCheck" aria-label="Connected">
                        ✓
                      </span>
                    )}
                  </span>
                  <div className="UiSkillTopRight">
                    {renderCta(connector.id)}
                  </div>
                </div>
                <div className="UiSkillName">{connector.name}</div>
                <div className="UiSkillDescription">{connector.description}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Telegram modal */}
      <Modal
        open={activeModal === "telegram"}
        header="Telegram"
        onClose={() => setActiveModal(null)}
        aria-label="Telegram settings"
      >
        <TelegramModal
          port={port}
          isConnected={statuses.telegram === "connected"}
          onConnected={() => handleConnected("telegram")}
          onDisabled={() => void handleDisabled("telegram")}
        />
      </Modal>

      {/* Discord modal */}
      <Modal
        open={activeModal === "discord"}
        header="Discord"
        onClose={() => setActiveModal(null)}
        aria-label="Discord settings"
      >
        <DiscordModal
          port={port}
          isConnected={statuses.discord === "connected"}
          onConnected={() => handleConnected("discord")}
          onDisabled={() => void handleDisabled("discord")}
        />
      </Modal>

      {/* Slack modal */}
      <Modal
        open={activeModal === "slack"}
        header="Slack"
        onClose={() => setActiveModal(null)}
        aria-label="Slack settings"
      >
        <SlackModal
          port={port}
          isConnected={statuses.slack === "connected"}
          onConnected={() => handleConnected("slack")}
          onDisabled={() => void handleDisabled("slack")}
        />
      </Modal>

      {/* Generic modals for remaining platforms */}
      {(["signal", "whatsapp", "matrix", "email", "homeassistant", "sms", "dingtalk", "feishu", "mattermost", "bluebubbles"] as const).map(
        (id) => (
          <Modal
            key={id}
            open={activeModal === id}
            header={CONNECTORS.find((c) => c.id === id)?.name ?? id}
            onClose={() => setActiveModal(null)}
            aria-label={`${id} settings`}
          >
            <GenericConnectorModal
              port={port}
              platformId={id}
              platformInfo={getPlatformInfo(id) ?? null}
              isConnected={statuses[id] === "connected"}
              onConnected={() => handleConnected(id)}
              onDisabled={() => void handleDisabled(id)}
            />
          </Modal>
        ),
      )}

      {/* Install confirmation dialog */}
      <ConfirmDialog
        open={installConfirm !== null}
        title="Install dependencies"
        subtitle={`Install Python packages for ${CONNECTORS.find((c) => c.id === installConfirm)?.name ?? installConfirm}? This may take a moment.`}
        confirmLabel="Install"
        onConfirm={() => void handleInstallConfirm()}
        onCancel={() => setInstallConfirm(null)}
      />
    </div>
  );
}
