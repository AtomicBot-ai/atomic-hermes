import React from "react";

import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { errorToMessage } from "@lib/error-format";
import s from "../OtherTab.module.css";

export function NotificationsSection({ onError }: { onError: (msg: string | null) => void }) {
  const [enabled, setEnabled] = React.useState(true);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.notificationsGet) {
      return;
    }
    void api.notificationsGet().then((res) => {
      setEnabled(res.enabled);
    });
  }, []);

  const toggleEnabled = React.useCallback(
    async (next: boolean) => {
      const api = getDesktopApiOrNull();
      if (!api?.notificationsSet) {
        onError(DESKTOP_API_UNAVAILABLE);
        return;
      }
      setEnabled(next);
      try {
        await api.notificationsSet(next);
      } catch (err) {
        setEnabled(!next);
        onError(errorToMessage(err));
      }
    },
    [onError],
  );

  return (
    <section className={s.UiSettingsOtherSection}>
      <h3 className={s.UiSettingsOtherSectionTitle}>Notifications</h3>
      <div className={s.UiSettingsOtherCard}>
        <div className={s.UiSettingsOtherRow}>
          <span className={s.UiSettingsOtherRowLabel}>Desktop notifications</span>
          <span className={s.UiSettingsOtherAppRowValue}>
            <label className={s.UiSettingsOtherToggle} aria-label="Enable desktop notifications">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => void toggleEnabled(e.target.checked)}
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
