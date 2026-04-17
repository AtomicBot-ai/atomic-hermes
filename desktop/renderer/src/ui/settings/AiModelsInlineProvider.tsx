import React from "react";
import {
  ActionButton,
  CheckIcon,
  InlineError,
  Modal,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@shared/kit";
import type { ProviderDef } from "../setup/providers";
import s from "./AiModelsTab.module.css";

function openExternal(url: string) {
  const api = (window as any).hermesAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, "_blank");
}

async function pasteFromClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    return "";
  }
}

export function AiModelsInlineProvider(props: {
  provider: ProviderDef;
  providerConfigured: boolean;
  isReloading: boolean;
  isSavingProvider: boolean;
  saveError: string;
  apiKey: string;
  setApiKey: React.Dispatch<React.SetStateAction<string>>;
  baseUrl: string;
  setBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  oauthStep: "idle" | "loading" | "waiting" | "success" | "error";
  oauthUserCode: string;
  oauthVerificationUrl: string;
  oauthError: string;
  canEditConfig: boolean;
  onReload: () => Promise<void>;
  onSave: () => Promise<boolean>;
  onOAuthStart: () => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [oauthOpen, setOauthOpen] = React.useState(false);
  const [clipboardError, setClipboardError] = React.useState("");

  React.useEffect(() => {
    setEditing(false);
    setOauthOpen(false);
    setClipboardError("");
  }, [props.provider.id]);

  React.useEffect(() => {
    if (props.oauthStep === "success" && oauthOpen) {
      setOauthOpen(false);
    }
  }, [oauthOpen, props.oauthStep]);

  const needsApiKey =
    props.provider.authType === "api_key" || props.provider.authType === "custom";
  const needsBaseUrl =
    props.provider.id === "ollama" || props.provider.authType === "custom";
  const isOAuth = props.provider.authType === "oauth";
  const showStructuredInputs = needsBaseUrl;

  const handlePaste = React.useCallback(async () => {
    const text = await pasteFromClipboard();
    if (!text) {
      setClipboardError("Clipboard is empty or unavailable.");
      return;
    }
    props.setApiKey(text);
    setClipboardError("");
  }, [props]);

  const handleSave = React.useCallback(async () => {
    // #region agent log
    fetch('http://127.0.0.1:7831/ingest/afbd3787-1f02-4bfb-8a9a-c6c81cb2ee48',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bdc941'},body:JSON.stringify({sessionId:'bdc941',hypothesisId:'H1',location:'AiModelsInlineProvider.tsx:handleSave:entry',message:'Save click fired',data:{providerId:props.provider.id,apiKeyLen:props.apiKey.length,apiKeyTrimmedLen:props.apiKey.trim().length,isSavingProvider:props.isSavingProvider,providerConfigured:props.providerConfigured,editing,authType:props.provider.authType},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setClipboardError("");
    const saved = await props.onSave();
    // #region agent log
    fetch('http://127.0.0.1:7831/ingest/afbd3787-1f02-4bfb-8a9a-c6c81cb2ee48',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bdc941'},body:JSON.stringify({sessionId:'bdc941',hypothesisId:'H2',location:'AiModelsInlineProvider.tsx:handleSave:result',message:'onSave returned',data:{saved},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (saved) {
      setEditing(false);
    }
  }, [props]);

  if (isOAuth) {
    return (
      <div className={s.apiKeySection}>
        <div className={s.apiKeyLabel}>Authentication</div>

        <div className={s.apiKeyConfiguredCard}>
          <div className={s.apiKeyConfiguredBody}>
            <h3 className={s.apiKeyConfiguredTitle}>
              {props.providerConfigured ? "Provider connected" : "Provider not connected"}
            </h3>
            <p className={s.apiKeyConfiguredHint}>
              {props.provider.helpText ?? `Connect your ${props.provider.name} account to continue.`}
            </p>
          </div>
          <ActionButton
            variant={props.providerConfigured ? "secondary" : "primary"}
            className={s.apiKeyConfiguredButton}
            onClick={() => setOauthOpen(true)}
          >
            {props.providerConfigured ? "Reconnect" : "Connect"}
          </ActionButton>
        </div>

        <Modal
          open={oauthOpen}
          onClose={() => setOauthOpen(false)}
          header={`Connect ${props.provider.name}`}
          aria-label={`Connect ${props.provider.name}`}
        >
          <div className={s.modalBody}>
            <p className={s.apiKeyHelpText}>
              {props.provider.helpText ?? `Connect your ${props.provider.name} account to continue.`}{" "}
              {props.provider.helpUrl ? (
                <a
                  href={props.provider.helpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={s.inlineLink}
                  onClick={(event) => {
                    event.preventDefault();
                    openExternal(props.provider.helpUrl!);
                  }}
                >
                  Learn more
                </a>
              ) : null}
            </p>

            <div className={s.authStatusCard}>
              <div className={s.authStatusRow}>
                <span
                  className={`${s.authStatusDot} ${
                    props.oauthStep === "error"
                      ? s.authStatusDotError
                      : props.oauthStep === "success"
                        ? s.authStatusDotReady
                        : s.authStatusDotInfo
                  }`}
                />
                <span className={s.authStatusText}>
                  {props.oauthStep === "success"
                    ? "Authenticated successfully."
                    : props.oauthStep === "waiting"
                      ? "Waiting for approval..."
                      : props.oauthStep === "loading"
                        ? "Starting OAuth flow..."
                        : props.oauthError || "Use OAuth to connect this provider."}
                </span>
              </div>

              {props.oauthUserCode ? <div className={s.oauthCode}>{props.oauthUserCode}</div> : null}

              {props.oauthVerificationUrl ? (
                <SecondaryButton size="sm" onClick={() => openExternal(props.oauthVerificationUrl)}>
                  Open approval page
                </SecondaryButton>
              ) : null}
            </div>

            {props.saveError ? (
              <div className={s.errorWrap}>
                <InlineError>{props.saveError}</InlineError>
              </div>
            ) : null}

            <div className={s.modalActions}>
              <SecondaryButton size="sm" onClick={() => setOauthOpen(false)}>
                Close
              </SecondaryButton>
              <PrimaryButton
                size="sm"
                loading={props.isSavingProvider || props.oauthStep === "loading"}
                disabled={!props.canEditConfig || props.oauthStep === "waiting"}
                onClick={() => void props.onOAuthStart()}
              >
                {props.oauthStep === "error" ? "Retry" : "Connect"}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  if (showStructuredInputs) {
    return (
      <div className={s.apiKeySection}>
        <div className={s.apiKeyLabel}>
          {props.provider.id === "ollama" ? "Connection" : "Provider configuration"}
        </div>
        <p className={s.apiKeyHelpText}>
          {props.provider.helpText ?? "Configure provider access and refresh the model catalog."}
        </p>

        <div className={s.apiKeyInputRow}>
          <TextInput
            label={props.provider.id === "ollama" ? "Ollama URL" : "Base URL"}
            value={props.baseUrl}
            onChange={props.setBaseUrl}
            placeholder={
              props.provider.id === "ollama" ? "http://localhost:11434" : "https://api.example.com/v1"
            }
          />
        </div>

        {needsApiKey ? (
          <div className={s.apiKeyInputRow}>
            <TextInput
              label={`${props.provider.name} API key`}
              type="password"
              value={props.apiKey}
              onChange={props.setApiKey}
              placeholder={props.provider.placeholder ?? "sk-..."}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        ) : null}

        {props.saveError ? (
          <div className={s.errorWrap}>
            <InlineError>{props.saveError}</InlineError>
          </div>
        ) : null}

        <div className={s.apiKeyActions}>
          <SecondaryButton size="sm" onClick={() => void props.onReload()} disabled={props.isReloading}>
            Reload
          </SecondaryButton>
          <PrimaryButton size="sm" loading={props.isSavingProvider} onClick={() => void handleSave()}>
            Save
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className={s.apiKeySection}>
      <div className={s.apiKeyLabel}>API Key</div>

      {props.providerConfigured && !editing ? (
        <div className={s.apiKeyConfiguredCard}>
          <div className={s.apiKeyConfiguredIcon}>
            <CheckIcon />
          </div>
          <div className={s.apiKeyConfiguredBody}>
            <h3 className={s.apiKeyConfiguredTitle}>API key configured</h3>
            <p className={s.apiKeyConfiguredHint}>You can edit your API key settings</p>
          </div>
          <ActionButton className={s.apiKeyConfiguredButton} onClick={() => setEditing(true)}>
            Edit
          </ActionButton>
        </div>
      ) : (
        <>
          <p className={s.apiKeyHelpText}>
            {props.provider.helpText ?? "Enter your provider credentials to continue."}{" "}
            {props.provider.helpUrl ? (
              <a
                href={props.provider.helpUrl}
                target="_blank"
                rel="noreferrer"
                className={s.inlineLink}
                onClick={(event) => {
                  event.preventDefault();
                  openExternal(props.provider.helpUrl!);
                }}
              >
                Get API key
              </a>
            ) : null}
          </p>

          <div className={s.apiKeyInputRow}>
            <TextInput
              type="password"
              value={props.apiKey}
              onChange={props.setApiKey}
              placeholder={props.provider.placeholder ?? "sk-..."}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              isError={clipboardError}
            />
          </div>

          {props.saveError ? (
            <div className={s.errorWrap}>
              <InlineError>{props.saveError}</InlineError>
            </div>
          ) : null}

          <div className={s.apiKeyActions}>
            {props.providerConfigured && editing ? (
              <ActionButton
                onClick={() => {
                  setEditing(false);
                  setClipboardError("");
                }}
              >
                Cancel
              </ActionButton>
            ) : null}
            <ActionButton onClick={() => void handlePaste()}>Paste</ActionButton>
            <ActionButton variant="primary" loading={props.isSavingProvider} onClick={() => void handleSave()}>
              Save
            </ActionButton>
          </div>
        </>
      )}
    </div>
  );
}
