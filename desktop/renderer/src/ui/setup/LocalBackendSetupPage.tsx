import React from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  downloadLlamacppBackend,
  cancelLlamacppBackendDownload,
  fetchLlamacppBackendStatus,
} from "@store/slices/llamacppSlice";
import { GlassCard, SecondaryButton } from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics";
import { OnboardingHeader } from "./OnboardingHeader";
import { useSetup } from "./setup-context";
import { LOCAL_MODEL_FLOW } from "./onboarding-steps";

export function LocalBackendSetupPage(props: { onContinue: () => void; onBack: () => void }) {
  useOnboardingStepEvent("local_backend_setup", "local-model");
  const navigate = useNavigate();
  const { setupFlow, skip } = useSetup();
  const dispatch = useAppDispatch();
  const backendDownloaded = useAppSelector((s) => s.llamacpp.backendDownloaded);
  const backendDownload = useAppSelector((s) => s.llamacpp.backendDownload);
  const startedRef = React.useRef(false);
  const autoContinuedRef = React.useRef(false);

  React.useEffect(() => {
    if (setupFlow !== "local-model") {
      void navigate("../setup-mode", { relative: "path", replace: true });
    }
  }, [navigate, setupFlow]);

  React.useEffect(() => {
    void (async () => {
      const status = await dispatch(fetchLlamacppBackendStatus()).unwrap();
      if (status?.downloaded) return;
      if (!startedRef.current) {
        startedRef.current = true;
        void dispatch(downloadLlamacppBackend());
      }
    })();
  }, [dispatch]);

  const isDone = backendDownloaded;
  React.useEffect(() => {
    if (isDone && !autoContinuedRef.current) {
      autoContinuedRef.current = true;
      props.onContinue();
    }
  }, [isDone, props.onContinue]);

  const handleCancel = React.useCallback(() => {
    void dispatch(cancelLlamacppBackendDownload());
  }, [dispatch]);

  const handleRetry = React.useCallback(() => {
    void dispatch(downloadLlamacppBackend());
  }, [dispatch]);

  const isDownloading = backendDownload.kind === "downloading";

  return (
    <>
      <OnboardingHeader
        totalSteps={LOCAL_MODEL_FLOW.totalSteps}
        activeStep={LOCAL_MODEL_FLOW.steps.backendDownload}
        onBack={props.onBack}
        onSkip={skip}
      />
      <GlassCard className="UiGlassCardOnboarding">
        <div className="UiSectionContent">
          <div>
            <div className="UiSectionTitle">Setting up AI Engine</div>
            <div className="UiSectionSubtitle">
              Downloading the local inference engine (llama.cpp) to run models on your Mac.
            </div>
          </div>

          {isDownloading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14, color: "var(--muted3)" }}>
                Downloading... {backendDownload.percent}%
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  borderRadius: 3,
                  background: "var(--surface-overlay)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${backendDownload.percent}%`,
                    height: "100%",
                    background: "var(--accent-brand)",
                    borderRadius: 3,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <SecondaryButton size="sm" onClick={handleCancel}>
                Cancel
              </SecondaryButton>
            </div>
          )}

          {backendDownload.kind === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: "var(--error)", fontSize: 13 }}>{backendDownload.message}</div>
              <SecondaryButton size="sm" onClick={handleRetry}>
                Retry
              </SecondaryButton>
            </div>
          )}
        </div>
      </GlassCard>
    </>
  );
}
