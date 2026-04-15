import React from "react";
import { settingsStyles as s } from "./SettingsPage";

export function PlaceholderTab(props: {
  title: string;
  description: string;
  accent?: string;
}) {
  return (
    <div className={s.UiSettingsPanel}>
      <div className={s.UiSettingsPanelHeader}>
        <h2 className={s.UiSettingsTabTitle}>{props.title}</h2>
        <p className={s.UiSettingsLead}>{props.description}</p>
      </div>

      <section className={s.UiSettingsSection}>
        <div className={s.UiPlaceholderCard}>
          <div className={s.UiPlaceholderBadge}>{props.accent || "Coming soon"}</div>
          <div className={s.UiPlaceholderTitle}>This section is not wired in Hermes yet</div>
          <p className={s.UiPlaceholderText}>
            The settings shell has been ported from the desktop control UI, but this area still
            needs Hermes-specific backend and state integrations.
          </p>
        </div>
      </section>
    </div>
  );
}
