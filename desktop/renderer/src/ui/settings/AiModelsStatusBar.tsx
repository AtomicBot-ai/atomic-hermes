import React from "react";
import s from "./AiModelsTab.module.css";

const SERVER_STATUS_LABELS: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting…",
  loading: "Loading model…",
  running: "Running",
  error: "Error",
};

export const LLAMACPP_PRIMARY_PREFIX = "llamacpp/";

export function formatModelIdForStatusBar(rawId: string): string {
  const t = rawId.trim();
  const i = t.indexOf("/");
  if (i >= 0 && i < t.length - 1) return t.slice(i + 1);
  return t;
}

type ServerStatus = {
  running: boolean;
  healthy: boolean;
  loading: boolean;
};

/** Maps llamacpp server status to a UI key for the status bar (Server / Running Model). */
export function resolveLlamacppServerUiKey(status: ServerStatus | null): string {
  if (!status) return "stopped";
  if (status.healthy) return "running";
  if (status.loading) return "loading";
  if (status.running) return "starting";
  return "stopped";
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={8} height={8} viewBox="0 0 8 8" aria-hidden>
      <rect width={8} height={8} rx={1.5} fill="currentColor" />
    </svg>
  );
}

function ServerSegment(props: {
  statusKey: string;
  onStop?: () => void;
  stopping?: boolean;
}) {
  const canStop = props.statusKey === "running" || props.statusKey === "starting" || props.statusKey === "loading";

  return (
    <div className={s.statusSegment}>
      <span className={s.statusLabel}>Server</span>
      <span className={s.statusValue}>
        <span className={`${s.serverDot} ${s[`serverDot--${props.statusKey}`] ?? ""}`} />
        <span className={s.statusValueText}>
          {SERVER_STATUS_LABELS[props.statusKey] ?? props.statusKey}
        </span>
        {canStop && (
          <button
            type="button"
            className={s.serverStopBtn}
            onClick={props.onStop}
            disabled={props.stopping}
            aria-label={props.stopping ? "Stopping local model server" : "Stop local model server"}
          >
            <StopIcon />
            <span className={s.serverStopBtnLabel}>{props.stopping ? "Stopping…" : "Stop"}</span>
          </button>
        )}
      </span>
    </div>
  );
}

function RunningModelSegment(props: { label: string }) {
  return (
    <div className={`${s.statusSegment} ${s.statusBarRunningModel}`}>
      <span className={s.statusLabel}>Running Model</span>
      <span className={s.statusValue}>
        <span className={s.statusValueText} title={props.label}>
          {props.label}
        </span>
      </span>
    </div>
  );
}

export function AiModelsStatusBar(props: {
  isLocalModels: boolean;
  modeLabel: string;
  modelName: string | null;
  runningModelLabel: string;
  serverStatus?: ServerStatus | null;
  onStop?: () => void;
  stopping?: boolean;
}) {
  const statusKey = resolveLlamacppServerUiKey(props.serverStatus ?? null);

  return (
    <div className={`${s.statusBar} ${s.statusBarHorizontal}`}>
      <div className={s.statusBarHorizontalMain}>
        <div className={s.statusSegment}>
          <span className={s.statusLabel}>Mode</span>
          <span className={s.statusValue}>
            <span className={s.statusValueText}>{props.modeLabel}</span>
          </span>
        </div>
        <div className={s.statusSegment}>
          <span className={s.statusLabel}>Model</span>
          <span className={s.statusValue}>
            <span className={s.statusValueText}>{props.modelName ?? "Not selected"}</span>
          </span>
        </div>
        <ServerSegment statusKey={statusKey} onStop={props.onStop} stopping={props.stopping} />
        <RunningModelSegment label={props.runningModelLabel} />
      </div>
    </div>
  );
}
