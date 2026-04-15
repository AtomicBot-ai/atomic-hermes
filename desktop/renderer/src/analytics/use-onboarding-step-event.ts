import React from "react";
import { captureRenderer, ANALYTICS_EVENTS } from "@analytics";

/**
 * Fires `onboarding_step` exactly once per component mount with the given
 * step name. Uses useRef guard (no sessionStorage) so every arrival
 * at a step is tracked — correct behavior for funnel analysis.
 */
export function useOnboardingStepEvent(step: string): void {
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (firedRef.current) return;
    captureRenderer(ANALYTICS_EVENTS.onboardingStep, { step });
    firedRef.current = true;
  }, [step]);
}
