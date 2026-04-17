import React from "react";

import { useAppSelector } from "@store/hooks";
import s from "../../updates/UpdateBanner.module.css";

export function DesktopWarmupBanner() {
  const status = useAppSelector((st) => st.desktopWarmup.status);
  const detail = useAppSelector((st) => st.desktopWarmup.detail);
  const mode = useAppSelector((st) => st.config.mode);
  const serverStatus = useAppSelector((st) => st.llamacpp.serverStatus);

  if (status === "idle" || status === "ready") {
    return null;
  }

  if (mode === "self-managed") {
    return null;
  }

  if (serverStatus !== null && !serverStatus.running) {
    return null;
  }

  const isError = status === "error";

  return (
    <div
      className={`${s.UpdateBanner} ${s["UpdateBanner--right"]} ${s["UpdateBanner--inStack"]}`}
      role="status"
      aria-live="polite"
    >
      <div className={`${s["UpdateBanner-icon"]} ${isError ? s["UpdateBanner-icon--error"] : ""}`}>
        {isError ? (
          <span style={{ fontWeight: 800, fontSize: 14 }} aria-hidden>
            !
          </span>
        ) : (
          <span className={s["UpdateBanner-spinner"]} aria-hidden />
        )}
      </div>
      <div className={s["UpdateBanner-body"]}>
        <span className={s["UpdateBanner-text"]}>
          {isError ? "Local model warmup failed" : "Warming up local model. It can take a few minutes"}
        </span>
        {isError && detail ? (
          <span style={{ fontSize: 12, opacity: 0.85, color: "var(--muted)" }}>{detail}</span>
        ) : null}
      </div>
    </div>
  );
}
