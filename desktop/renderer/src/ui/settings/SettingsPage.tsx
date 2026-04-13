import React from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import type { GatewayState } from "@store/slices/gatewaySlice";
import { HeroPageLayout } from "@shared/kit";
import { SettingsStateProvider } from "./settings-context";
import { DEFAULT_SETTINGS_TAB, SETTINGS_TABS } from "./settings-tabs";
import s from "./SettingsPage.module.css";
export { s as settingsStyles };

export function SettingsPage({
  state,
}: {
  state: Extract<GatewayState, { kind: "ready" }>;
}) {
  return (
    <SettingsStateProvider port={state.port}>
      <HeroPageLayout
        aria-label="Settings page"
        hideTopbar
        color="secondary"
        className={s.UiSettingsShell}
      >
        <div className={s.UiSettingsShellWrapper}>
          <div className={s.UiSettingsHeader}>
            <div className={s.UiSettingsTitleRow}>
              <h1 className={s.UiSettingsTitle}>Settings</h1>
              <p className={s.UiSettingsSubtitle}>
                Manage your AI provider credentials, model defaults, and upcoming desktop
                integrations.
              </p>
            </div>
            <nav className={s.UiSettingsTabs} aria-label="Settings sections">
              {SETTINGS_TABS.map((tab) => (
                <NavLink
                  key={tab.id}
                  to={tab.href}
                  className={({ isActive }) =>
                    `${s.UiSettingsTab}${isActive ? ` ${s["UiSettingsTab--active"]}` : ""}`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className={s.UiSettingsContent}>
            <Outlet />
          </div>
        </div>
      </HeroPageLayout>
    </SettingsStateProvider>
  );
}

export function SettingsIndexRedirect() {
  return <Navigate to={DEFAULT_SETTINGS_TAB.path} replace relative="path" />;
}
