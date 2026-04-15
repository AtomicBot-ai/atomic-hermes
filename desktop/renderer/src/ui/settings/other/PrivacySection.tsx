import React from "react";

import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { optInRenderer, optOutRenderer } from "@analytics";
import { errorToMessage } from "@lib/error-format";
import s from "../OtherTab.module.css";

export function PrivacySection({ onError }: { onError: (msg: string | null) => void }) {
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(false);
  const userIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.analyticsGet) {
      return;
    }
    void api.analyticsGet().then((res) => {
      setAnalyticsEnabled(res.enabled);
      userIdRef.current = res.userId;
    });
  }, []);

  const toggleAnalytics = React.useCallback(
    async (enabled: boolean) => {
      const api = getDesktopApiOrNull();
      if (!api?.analyticsSet) {
        onError(DESKTOP_API_UNAVAILABLE);
        return;
      }
      setAnalyticsEnabled(enabled);
      try {
        await api.analyticsSet(enabled);
        if (enabled && userIdRef.current) {
          optInRenderer(userIdRef.current);
        } else {
          optOutRenderer();
        }
      } catch (err) {
        setAnalyticsEnabled(!enabled);
        onError(errorToMessage(err));
      }
    },
    [onError],
  );

  return (
    <section className={s.UiSettingsOtherSection}>
      <h3 className={s.UiSettingsOtherSectionTitle}>Privacy</h3>
      <div className={s.UiSettingsOtherCard}>
        <div className={s.UiSettingsOtherRow}>
          <span className={s.UiSettingsOtherRowLabel}>Anonymous statistics</span>
          <span className={s.UiSettingsOtherAppRowValue}>
            <label className={s.UiSettingsOtherToggle} aria-label="Share anonymous usage data">
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(e) => void toggleAnalytics(e.target.checked)}
              />
              <span className={s.UiSettingsOtherToggleTrack}>
                <span className={s.UiSettingsOtherToggleThumb} />
              </span>
            </label>
          </span>
        </div>
      </div>
    </section>
  );
}
