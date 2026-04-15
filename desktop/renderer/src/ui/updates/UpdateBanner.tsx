import React from "react";

import { getDesktopApiOrNull } from "../../ipc/desktopApi";
import s from "./UpdateBanner.module.css";

type UpdatePhase =
  | { kind: "idle" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 2v8.5m0 0L4.5 7m3.5 3.5L11.5 7M3 13h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReadyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 5.5v3M8 11h.007M3.072 13h9.856c1.072 0 1.744-1.16 1.208-2.084L9.208 3.084a1.396 1.396 0 00-2.416 0L1.864 10.916C1.328 11.84 2 13 3.072 13z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BtnSpinner() {
  return <span className={s["UpdateBanner-spinner"]} />;
}

export function UpdateBanner() {
  const [phase, setPhase] = React.useState<UpdatePhase>({ kind: "idle" });
  const [dismissed, setDismissed] = React.useState(false);
  const [startingDownload, setStartingDownload] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api) {
      return;
    }

    const unsubs: Array<() => void> = [];

    if (api.onUpdateAvailable) {
      unsubs.push(
        api.onUpdateAvailable((payload) => {
          setPhase({ kind: "available", version: payload.version });
          setDismissed(false);
          setStartingDownload(false);
        }),
      );
    }

    if (api.onUpdateDownloadProgress) {
      unsubs.push(
        api.onUpdateDownloadProgress((payload) => {
          setStartingDownload(false);
          setPhase({ kind: "downloading", percent: Math.round(payload.percent) });
        }),
      );
    }

    if (api.onUpdateDownloaded) {
      unsubs.push(
        api.onUpdateDownloaded((payload) => {
          setPhase({ kind: "ready", version: payload.version });
          setDismissed(false);
          setStartingDownload(false);
        }),
      );
    }

    if (api.onUpdateError) {
      unsubs.push(
        api.onUpdateError((payload) => {
          setStartingDownload(false);
          setInstalling(false);
          setPhase((prev) => {
            if (prev.kind === "downloading") {
              return { kind: "error", message: payload.message };
            }
            return prev;
          });
        }),
      );
    }

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, []);

  if (phase.kind === "idle" || dismissed) {
    return null;
  }

  const isError = phase.kind === "error";

  return (
    <div className={s.UpdateBanner} role="status" aria-live="polite">
      <div
        className={`${s["UpdateBanner-icon"]}${isError ? ` ${s["UpdateBanner-icon--error"]}` : ""}`}
      >
        {phase.kind === "available" && <DownloadIcon />}
        {phase.kind === "downloading" && <DownloadIcon />}
        {phase.kind === "ready" && <ReadyIcon />}
        {phase.kind === "error" && <ErrorIcon />}
      </div>

      {phase.kind === "available" && (
        <>
          <span className={s["UpdateBanner-text"]}>
            Update available: <strong>v{phase.version}</strong>
          </span>
          <div className={s["UpdateBanner-actions"]}>
            <button
              className={`${s["UpdateBanner-btn"]} ${s["UpdateBanner-btn--primary"]}`}
              disabled={startingDownload}
              onClick={() => {
                setStartingDownload(true);
                void getDesktopApiOrNull()?.downloadUpdate?.();
              }}
            >
              {startingDownload ? <BtnSpinner /> : "Download"}
            </button>
            <button
              className={`${s["UpdateBanner-btn"]} ${s["UpdateBanner-btn--dismiss"]}`}
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </>
      )}

      {phase.kind === "downloading" && (
        <>
          <div className={s["UpdateBanner-body"]}>
            <span className={s["UpdateBanner-text"]}>Downloading update…</span>
            <div className={s["UpdateBanner-progress"]}>
              <div
                className={s["UpdateBanner-progressBar"]}
                style={{ width: `${phase.percent}%` }}
              />
            </div>
          </div>
          <span className={s["UpdateBanner-percent"]}>{phase.percent}%</span>
        </>
      )}

      {phase.kind === "ready" && (
        <>
          <span className={s["UpdateBanner-text"]}>
            <strong>v{phase.version}</strong> ready to install
          </span>
          <div className={s["UpdateBanner-actions"]}>
            <button
              className={`${s["UpdateBanner-btn"]} ${s["UpdateBanner-btn--primary"]}`}
              disabled={installing}
              onClick={() => {
                setInstalling(true);
                void getDesktopApiOrNull()?.installUpdate?.();
              }}
            >
              {installing ? <BtnSpinner /> : "Restart & Update"}
            </button>
            {!installing && (
              <button
                className={`${s["UpdateBanner-btn"]} ${s["UpdateBanner-btn--dismiss"]}`}
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
              >
                &times;
              </button>
            )}
          </div>
        </>
      )}

      {phase.kind === "error" && (
        <>
          <span className={`${s["UpdateBanner-text"]} ${s["UpdateBanner-text--error"]}`}>
            Update failed: {phase.message}
          </span>
          <div className={s["UpdateBanner-actions"]}>
            <button
              className={`${s["UpdateBanner-btn"]} ${s["UpdateBanner-btn--dismiss"]}`}
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </>
      )}
    </div>
  );
}
