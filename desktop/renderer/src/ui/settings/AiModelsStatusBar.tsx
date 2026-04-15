import React from "react";
import s from "./AiModelsTab.module.css";

export function AiModelsStatusBar(props: {
  modeLabel: string;
  modelName: string | null;
}) {
  return (
    <div className={s.statusBar}>
      <div className={s.statusBarMain}>
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
      </div>
    </div>
  );
}
