import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchLlamacppModels,
  fetchLlamacppSystemInfo,
  fetchLlamacppBackendStatus,
  fetchLlamacppServerStatus,
  downloadLlamacppBackend,
  checkLlamacppBackendUpdate,
  downloadLlamacppModel,
  cancelLlamacppModelDownload,
  setLlamacppActiveModel,
  deleteLlamacppModel,
  llamacppActions,
} from "@store/slices/llamacppSlice";
import { getDesktopApi } from "../../../ipc/desktopApi";
import { patchConfig } from "../../../services/api";
import {
  isProfileUsingLlamacppServer,
  profileLlamacppCatalogModelId,
} from "../llamacpp-profile-config";
import { useSettingsState } from "../settings-context";
import s from "./LocalModelsTab.module.css";

const LLAMACPP_BASE_URL = "http://127.0.0.1:18791/v1";

export function LocalModelsTab(props: { port: number }) {
  const { port } = props;
  const dispatch = useAppDispatch();
  const { reloadConfig, configSnap } = useSettingsState();
  const {
    backendDownloaded,
    backendDownload,
    models,
    modelDownload,
  } = useAppSelector((st) => st.llamacpp);

  const autoStartedRef = React.useRef(false);
  const [selectingModelId, setSelectingModelId] = React.useState<string | null>(null);
  const [deleteConfirmModelId, setDeleteConfirmModelId] = React.useState<string | null>(null);
  const [deletingModelId, setDeletingModelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void dispatch(fetchLlamacppModels());
    void dispatch(fetchLlamacppSystemInfo());
    void dispatch(fetchLlamacppServerStatus());

    void (async () => {
      const status = await dispatch(fetchLlamacppBackendStatus()).unwrap();
      if (autoStartedRef.current) return;
      autoStartedRef.current = true;

      if (!status?.downloaded) {
        void dispatch(downloadLlamacppBackend());
      } else {
        const update = await dispatch(checkLlamacppBackendUpdate()).unwrap();
        if (update?.updateAvailable) {
          void dispatch(downloadLlamacppBackend());
        }
      }
    })();
  }, [dispatch]);

  const downloadingModelId = modelDownload.kind === "downloading" ? modelDownload.modelId : null;

  const profileActiveCatalogModelId = React.useMemo(() => {
    if (!isProfileUsingLlamacppServer(configSnap)) return null;
    return profileLlamacppCatalogModelId(configSnap?.activeModel ?? "");
  }, [configSnap]);

  const handleSelect = React.useCallback(
    async (modelId: string) => {
      setSelectingModelId(modelId);
      try {
        const serverResult = await dispatch(setLlamacppActiveModel(modelId)).unwrap();
        void dispatch(fetchLlamacppServerStatus());

        if (serverResult.ok) {
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
          await reloadConfig();

          const api = getDesktopApi();
          await api.llamacppPropagateModel?.(modelString);
        }
      } catch (err) {
        console.error("[LocalModelsTab] handleSelect failed:", err);
      } finally {
        setSelectingModelId(null);
      }
    },
    [dispatch, port],
  );

  const handleDelete = React.useCallback(
    async (modelId: string) => {
      setDeletingModelId(modelId);
      setDeleteConfirmModelId(null);
      try {
        await dispatch(deleteLlamacppModel(modelId)).unwrap();
      } catch (err) {
        console.error("[LocalModelsTab] delete failed:", err);
      } finally {
        setDeletingModelId(null);
      }
    },
    [dispatch]
  );

  return (
    <div className={s.root}>
      {backendDownload.kind === "error" && (
        <div className={s.downloadError}>
          <span>Engine download failed: {backendDownload.message}</span>
          <button
            type="button"
            className={s.dismissBtn}
            onClick={() => dispatch(llamacppActions.setBackendDownload({ kind: "idle" }))}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      <div className={s.modelList}>
        {models.map((model) => {
          const isActive = profileActiveCatalogModelId === model.id;
          const isDownloading = downloadingModelId === model.id;
          const isSelecting = selectingModelId === model.id;
          const isDeleting = deletingModelId === model.id;

          return (
            <div key={model.id} className={`${s.modelRow} ${isActive ? s.modelRowActive : ""}`}>
              <div className={s.modelIcon}>
                <ModelIcon icon={model.icon} />
              </div>
              <div className={s.modelInfo}>
                <div className={s.modelName}>
                  {model.name}
                  {model.tag && (
                    <span
                      className={`${s.tagBadge} ${model.tag === "Recommended" ? s.tagRecommended : s.tagHighPerformance}`}
                    >
                      {model.tag}
                    </span>
                  )}
                  {model.compatibility === "possible" && (
                    <span className={s.compatPossible}>May be slow</span>
                  )}
                </div>
                <div className={s.modelMeta}>
                  {model.description} &middot; {model.sizeLabel} &middot; {model.contextLabel}
                </div>
              </div>
              <div className={s.modelAction}>
                {model.downloaded ? (
                  isActive ? (
                    <span className={s.activeLabel}>Active</span>
                  ) : (
                    <div className={s.actionGroup}>
                      <button
                        type="button"
                        className={s.deleteBtn}
                        disabled={isDeleting}
                        onClick={() => setDeleteConfirmModelId(model.id)}
                        aria-label="Delete model"
                        title="Delete model"
                      >
                        <TrashIcon />
                      </button>
                      <button
                        type="button"
                        className={s.activateBtn}
                        disabled={isSelecting || selectingModelId !== null || isDeleting}
                        onClick={() => void handleSelect(model.id)}
                      >
                        {isSelecting ? "Starting..." : "Activate"}
                      </button>
                    </div>
                  )
                ) : isDownloading ? (
                  <div className={s.downloadingRow} aria-live="polite">
                    <span className={s.downloadingText}>
                      Downloading...{" "}
                      {modelDownload.kind === "downloading" ? `${modelDownload.percent}%` : ""}
                    </span>
                    <button
                      type="button"
                      className={s.cancelIcon}
                      onClick={() => void dispatch(cancelLlamacppModelDownload())}
                      aria-label="Cancel download"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={s.downloadBtn}
                    onClick={() => {
                      if (model.compatibility === "not-recommended") return;
                      void (async () => {
                        try {
                          await dispatch(downloadLlamacppModel(model.id)).unwrap();
                          await handleSelect(model.id);
                        } catch {
                          // errors rendered inline
                        }
                      })();
                    }}
                    disabled={
                      !backendDownloaded ||
                      downloadingModelId !== null ||
                      model.compatibility === "not-recommended"
                    }
                  >
                    {model.compatibility === "not-recommended" ? "Not enough RAM" : "Download"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modelDownload.kind === "error" && (
        <div className={s.downloadError}>
          <span>Download failed: {modelDownload.message}</span>
          <button
            type="button"
            className={s.dismissBtn}
            onClick={() => dispatch(llamacppActions.setModelDownload({ kind: "idle" }))}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {deleteConfirmModelId !== null && (
        <DeleteConfirmDialog
          onConfirm={() => {
            if (deleteConfirmModelId) void handleDelete(deleteConfirmModelId);
          }}
          onCancel={() => setDeleteConfirmModelId(null)}
        />
      )}
    </div>
  );
}

function DeleteConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          padding: "24px",
          maxWidth: 400,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Delete this model?</h3>
        <p style={{ color: "var(--muted3)", fontSize: 14, margin: "0 0 20px" }}>
          The model file will be removed from disk. You can re-download it later.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--surface-overlay)",
              background: "var(--surface-hover)",
              color: "var(--text)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--error)",
              background: "var(--error)",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

const MODEL_ICON_FILES: Record<string, string> = {
  qwen: "qwen.svg",
  glm: "glm.svg",
  nvidia: "nvidia.svg",
  google: "google.svg",
};

function resolveModelIconUrl(icon: string): string | undefined {
  const filename = MODEL_ICON_FILES[icon];
  if (!filename) return undefined;
  return new URL(
    `../../../../../assets/ai-models/${filename}`,
    import.meta.url,
  ).toString();
}

function ModelIcon({ icon }: { icon: string }) {
  const src = resolveModelIconUrl(icon);

  if (!src) {
    return (
      <div className={s.modelIconFallback}>
        {icon.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div className={s.modelIconBox}>
      <img src={src} alt="" width={20} height={20} />
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
