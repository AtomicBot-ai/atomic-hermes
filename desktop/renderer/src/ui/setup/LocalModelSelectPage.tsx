import React from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchLlamacppModels,
  fetchLlamacppSystemInfo,
  downloadLlamacppModel,
  cancelLlamacppModelDownload,
  setLlamacppActiveModel,
} from "@store/slices/llamacppSlice";
import { GlassCard, PrimaryButton, Modal } from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { patchConfig } from "../../services/api";
import { OnboardingHeader } from "./OnboardingHeader";
import { useSetup } from "./setup-context";
import { LOCAL_MODEL_FLOW } from "./onboarding-steps";
import s from "./LocalModelSelectPage.module.css";

const LLAMACPP_BASE_URL = "http://127.0.0.1:18791/v1";

const MODEL_ICON_FILES: Record<string, string> = {
  qwen: "qwen.svg",
  glm: "glm.svg",
  nvidia: "nvidia.svg",
  google: "google.svg",
};

function resolveModelIconUrl(icon: string): string | undefined {
  const filename = MODEL_ICON_FILES[icon];
  if (!filename) return undefined;
  return new URL(`../../../../assets/ai-models/${filename}`, import.meta.url).toString();
}

function ModelIcon({ icon }: { icon: string }) {
  const src = resolveModelIconUrl(icon);
  if (!src) {
    return (
      <div className={s.modelIcon} aria-hidden="true">
        <span style={{ fontSize: 14, fontWeight: 600 }}>{icon.charAt(0).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <div className={s.modelIcon}>
      <img src={src} alt="" width={20} height={20} />
    </div>
  );
}

export function LocalModelSelectPage(props: { onBack: () => void }) {
  useOnboardingStepEvent("local_model_select", "local-model");
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { port, setupFlow, skip } = useSetup();
  const models = useAppSelector((st) => st.llamacpp.models);
  const systemInfo = useAppSelector((st) => st.llamacpp.systemInfo);
  const modelDownload = useAppSelector((st) => st.llamacpp.modelDownload);
  const [selectingModelId, setSelectingModelId] = React.useState<string | null>(null);
  const [unsupportedModalOpen, setUnsupportedModalOpen] = React.useState(false);

  React.useEffect(() => {
    if (setupFlow !== "local-model") {
      void navigate("../setup-mode", { relative: "path", replace: true });
    }
  }, [navigate, setupFlow]);

  React.useEffect(() => {
    void dispatch(fetchLlamacppModels());
    void dispatch(fetchLlamacppSystemInfo());
  }, [dispatch]);

  const downloadingModelId = modelDownload.kind === "downloading" ? modelDownload.modelId : null;

  const activateModel = React.useCallback(
    async (modelId: string) => {
      const serverResult = await dispatch(setLlamacppActiveModel(modelId)).unwrap();
      if (!serverResult.ok) return;
      const modelString = `llamacpp/${serverResult.modelId ?? modelId}`;
      await patchConfig(port, {
        config: {
          provider: "custom",
          base_url: LLAMACPP_BASE_URL,
          model: modelString,
        },
        env: {
          CUSTOM_API_KEY: "LLAMACPP_LOCAL_KEY",
        },
      });
      await getDesktopApiOrNull()?.llamacppPropagateModel?.(modelString);
      void navigate("../finish", { relative: "path" });
    },
    [dispatch, navigate, port],
  );

  const handleSelect = React.useCallback(
    async (modelId: string) => {
      setSelectingModelId(modelId);
      try {
        await activateModel(modelId);
      } catch (err) {
        console.error("[LocalModelSelectPage] activate failed:", err);
      } finally {
        setSelectingModelId(null);
      }
    },
    [activateModel],
  );

  const handleDownload = React.useCallback(
    (modelId: string) => {
      void (async () => {
        try {
          await dispatch(downloadLlamacppModel(modelId)).unwrap();
          await handleSelect(modelId);
        } catch {
          // errors surfaced via modelDownload state
        }
      })();
    },
    [dispatch, handleSelect],
  );

  const handleCancel = React.useCallback(() => {
    void dispatch(cancelLlamacppModelDownload());
  }, [dispatch]);

  return (
    <>
      <OnboardingHeader
        totalSteps={LOCAL_MODEL_FLOW.totalSteps}
        activeStep={LOCAL_MODEL_FLOW.steps.modelSelect}
        onBack={props.onBack}
        onSkip={skip}
      />
      <GlassCard className={`UiProviderCard UiGlassCardOnboarding ${s.card}`}>
        <div className="UiSectionTitle">Choose a Model</div>
        <div className="UiSectionSubtitle">
          Select an AI model to run locally.
          {systemInfo ? <> Your Mac has {systemInfo.totalRamGb} GB RAM.</> : null}
        </div>

        <div className={`UiProviderList UiListWithScroll scrollable ${s.modelList}`}>
          {models.map((model) => {
            const isDownloading = downloadingModelId === model.id;
            const isSelecting = selectingModelId === model.id;
            const actionsDisabled = selectingModelId !== null && !isSelecting;

            return (
              <div key={model.id} className={s.modelRow}>
                <ModelIcon icon={model.icon} />
                <div className={s.modelInfo}>
                  <div className={s.modelName}>
                    {model.name}
                    {model.tag ? (
                      <span
                        className={`${s.badge} ${model.tag === "Recommended" ? s.badgeRecommended : s.badgeHighPerformance}`}
                      >
                        {model.tag}
                      </span>
                    ) : null}
                    {model.compatibility === "possible" ? (
                      <span className={`${s.badge} ${s.badgePossible}`}>May be slow</span>
                    ) : null}
                  </div>
                  <div className={s.modelMeta}>
                    {model.description} &middot; {model.sizeLabel} &middot; {model.contextLabel}
                  </div>
                </div>
                <div className={s.modelAction}>
                  {model.downloaded ? (
                    <button
                      type="button"
                      className="UiSkillConnectButton"
                      disabled={isSelecting || actionsDisabled}
                      onClick={() => void handleSelect(model.id)}
                    >
                      {isSelecting ? "Starting..." : "Select"}
                    </button>
                  ) : isDownloading ? (
                    <div className={s.downloadingRow}>
                      <span className={s.downloadingText}>
                        Downloading...{" "}
                        {modelDownload.kind === "downloading" ? `${modelDownload.percent}%` : ""}
                      </span>
                      <button type="button" className={s.cancelIcon} onClick={handleCancel} aria-label="Cancel download">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="UiSkillConnectButton"
                      disabled={actionsDisabled}
                      onClick={() => {
                        if (model.compatibility === "not-recommended") {
                          setUnsupportedModalOpen(true);
                          return;
                        }
                        handleDownload(model.id);
                      }}
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {modelDownload.kind === "error" ? (
          <div style={{ color: "var(--error)", fontSize: 13, marginTop: 8 }}>{modelDownload.message}</div>
        ) : null}

        <div className="UiProviderContinueRow">
          <div />
          <div className="UiSkillsBottomActions">
            <PrimaryButton size="sm" onClick={() => void navigate("../finish", { relative: "path" })}>
              Continue
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>

      <Modal open={unsupportedModalOpen} onClose={() => setUnsupportedModalOpen(false)} header="Unsupported Hardware">
        <p style={{ color: "var(--muted3)", fontSize: 14 }}>
          Model is not supported on your hardware. Your system does not have enough RAM to run this model.
        </p>
      </Modal>
    </>
  );
}
