import React from "react";
import { captureRenderer, ANALYTICS_EVENTS } from "@analytics";

const SESSION_KEY = "hermes_app_opened";

/**
 * Fires `app_opened` exactly once per Electron session when the component mounts.
 * Uses sessionStorage (cleared on app restart) as a dedup guard.
 */
export function useAppOpenedEvent(): void {
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (firedRef.current) return;
    if (sessionStorage.getItem(SESSION_KEY)) {
      firedRef.current = true;
      return;
    }

    captureRenderer(ANALYTICS_EVENTS.appOpened);
    sessionStorage.setItem(SESSION_KEY, "1");
    firedRef.current = true;
  }, []);
}
