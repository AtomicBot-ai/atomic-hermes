import React from "react";

import { getDesktopApiOrNull, DESKTOP_API_UNAVAILABLE } from "@ipc/desktopApi";
import { openExternal } from "@shared/utils/openExternal";
import { errorToMessage } from "@lib/error-format";
import s from "../OtherTab.module.css";
import { APP_VERSION } from "@lib/app-version";

export function AppInfoSection({ onError }: { onError: (msg: string | null) => void }) {
  const [launchAtStartup, setLaunchAtStartup] = React.useState(false);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.getLaunchAtLogin) {
      return;
    }
    void api.getLaunchAtLogin().then((res) => setLaunchAtStartup(res.enabled));
  }, []);

  const toggleLaunchAtStartup = React.useCallback(
    async (enabled: boolean) => {
      const api = getDesktopApiOrNull();
      if (!api?.setLaunchAtLogin) {
        onError(DESKTOP_API_UNAVAILABLE);
        return;
      }
      setLaunchAtStartup(enabled);
      try {
        await api.setLaunchAtLogin(enabled);
      } catch (err) {
        setLaunchAtStartup(!enabled);
        onError(errorToMessage(err));
      }
    },
    [onError],
  );

  return (
    <>
      {/* App & About */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>App</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Version</span>
            <span className={s.UiSettingsOtherAppRowValue}>Hermes v{APP_VERSION}</span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Auto start</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Launch at startup">
                <input
                  type="checkbox"
                  checked={launchAtStartup}
                  onChange={(e) => void toggleLaunchAtStartup(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>License</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() =>
                openExternal("https://polyformproject.org/licenses/noncommercial/1.0.0")
              }
            >
              PolyForm Noncommercial 1.0.0
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Support</span>
            <a href="mailto:support@hermes-agent.ai" className={s.UiSettingsOtherLink}>
              support@hermes-agent.ai
            </a>
          </div>
        </div>
        <div className={s.UiSettingsOtherLinksRow}>
          <span className={s.UiSettingsOtherFooterCopy}>
            &copy; {new Date().getFullYear()} Hermes
          </span>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://github.com/hermes-agent/hermes-agent")}
          >
            GitHub
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://hermes-agent.ai")}
          >
            Website
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://hermes-agent.ai/privacy-policy")}
          >
            Privacy Policy
          </button>
        </div>
      </section>

    </>
  );
}
