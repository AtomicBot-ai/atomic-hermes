import { app, ipcMain, type BrowserWindow } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

import { listProfiles } from "../files/profile-resolver";
import { downloadFile } from "./download";
import { getSystemInfo, getModelCompatibility, computeContextLength } from "./hardware";
import {
  LLAMACPP_MODELS,
  DEFAULT_LLAMACPP_MODEL_ID,
  getLlamacppModelDef,
  resolveLlamacppModelPath,
  resolveChatTemplatePath,
  type LlamacppModelId,
} from "./models";
import {
  clearActiveModelId,
  readActiveModelId,
  writeActiveModelId,
  getWarmupState,
  setWarmupState,
  resetWarmupState,
} from "./model-state";
import {
  downloadBackend,
  isBackendDownloaded,
  readBackendVersion,
  checkForBackendUpdate,
  resolveServerBinPath,
} from "./backend-download";
import { startLlamacppServer, stopLlamacppServer, getLlamacppServerStatus } from "./server";

export type LlamacppIpcParams = {
  llamacppDataDir: string;
  stateDir: string;
  getMainWindow: () => BrowserWindow | null;
};

export function registerLlamacppIpcHandlers(params: LlamacppIpcParams): void {
  const { llamacppDataDir, stateDir } = params;

  let backendAbort: AbortController | null = null;
  let modelAbort: AbortController | null = null;

  ipcMain.handle("llamacpp-system-info", () => {
    const sysInfo = getSystemInfo();
    const models = LLAMACPP_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      compatibility: getModelCompatibility(m, sysInfo),
    }));
    return { ...sysInfo, models };
  });

  ipcMain.handle("llamacpp-backend-status", async () => {
    const downloaded = isBackendDownloaded(llamacppDataDir);
    const version = readBackendVersion(llamacppDataDir);
    return {
      downloaded,
      version: version?.tag ?? null,
      downloadedAt: version?.downloadedAt ?? null,
    };
  });

  ipcMain.handle("llamacpp-backend-download", async () => {
    backendAbort?.abort();
    const abort = new AbortController();
    backendAbort = abort;

    try {
      const sendProgress = (percent: number, transferred: number, total: number) => {
        const win = params.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("llamacpp-backend-download-progress", {
            percent,
            transferred,
            total,
          });
        }
      };

      const result = await downloadBackend(llamacppDataDir, {
        onProgress: sendProgress,
        signal: abort.signal,
      });
      backendAbort = null;

      const status = await getLlamacppServerStatus();
      if (status.running) {
        const activeModelId = (readActiveModelId(stateDir) ?? DEFAULT_LLAMACPP_MODEL_ID) as LlamacppModelId;
        const model = getLlamacppModelDef(activeModelId);
        const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);
        const binPath = resolveServerBinPath(llamacppDataDir);

        if (fs.existsSync(modelPath) && fs.existsSync(binPath)) {
          const sysInfo = getSystemInfo();
          const ctxLen = computeContextLength(sysInfo.totalRamGb, model);
          const chatTemplateFile = resolveChatTemplatePath(model, {
            isPackaged: app.isPackaged,
            appPath: app.getAppPath(),
          });
          console.log(`[llamacpp] restarting server after backend update (model=${activeModelId})`);
          resetWarmupState();
          await startLlamacppServer(binPath, modelPath, {
            contextLength: ctxLen,
            modelId: activeModelId,
            chatTemplateFile,
            stateDir,
          });
        }
      }

      return { ok: true, tag: result.tag };
    } catch (err) {
      backendAbort = null;
      if (abort.signal.aborted) return { ok: false, error: "cancelled" };
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("llamacpp-backend-download-cancel", () => {
    if (backendAbort) {
      backendAbort.abort();
      backendAbort = null;
    }
    return { ok: true };
  });

  ipcMain.handle("llamacpp-backend-update", async () => {
    try {
      const result = await checkForBackendUpdate(llamacppDataDir);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("llamacpp-model-status", (_evt, p?: { model?: string }) => {
    const modelId = (typeof p?.model === "string" ? p.model : DEFAULT_LLAMACPP_MODEL_ID) as LlamacppModelId;
    const model = getLlamacppModelDef(modelId);
    const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);
    const exists = fs.existsSync(modelPath);
    let size = 0;
    if (exists) {
      try {
        size = fs.statSync(modelPath).size;
      } catch {
        // ignore
      }
    }
    return {
      downloaded: exists && size > 0,
      modelPath,
      size,
      modelId: model.id,
    };
  });

  ipcMain.handle("llamacpp-model-download", async (_evt, p?: { model?: string }) => {
    const modelId = (typeof p?.model === "string" ? p.model : DEFAULT_LLAMACPP_MODEL_ID) as LlamacppModelId;
    const model = getLlamacppModelDef(modelId);
    const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);
    fs.mkdirSync(path.dirname(modelPath), { recursive: true });

    modelAbort?.abort();
    const abort = new AbortController();
    modelAbort = abort;

    console.log(`[llamacpp] downloading model ${modelId}: ${model.huggingFaceUrl} -> ${modelPath}`);

    try {
      const sendProgress = (percent: number, transferred: number, total: number) => {
        const win = params.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("llamacpp-model-download-progress", {
            percent,
            transferred,
            total,
            modelId,
          });
        }
      };

      await downloadFile(model.huggingFaceUrl, modelPath, {
        onProgress: sendProgress,
        userAgent: "hermes-desktop/llamacpp-model-download",
        signal: abort.signal,
      });
      modelAbort = null;

      const stat = fs.statSync(modelPath);
      console.log(`[llamacpp] model ${modelId} downloaded: ${stat.size} bytes`);
      return { ok: true, modelPath };
    } catch (err) {
      modelAbort = null;
      console.error(`[llamacpp] model download failed: ${String(err)}`);
      if (abort.signal.aborted) return { ok: false, error: "cancelled" };
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("llamacpp-model-download-cancel", () => {
    if (modelAbort) {
      modelAbort.abort();
      modelAbort = null;
    }
    return { ok: true };
  });

  ipcMain.handle("llamacpp-model-delete", async (_evt, p: { model: string }) => {
    const modelId = p.model as LlamacppModelId;
    const model = getLlamacppModelDef(modelId);
    const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);

    const activeId = readActiveModelId(stateDir);
    if (activeId === modelId) {
      try {
        await stopLlamacppServer();
        clearActiveModelId(stateDir);
        resetWarmupState();
      } catch {
        // best effort
      }
    }

    try {
      if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
      }
      const dir = path.dirname(modelPath);
      try {
        const remaining = fs.readdirSync(dir);
        if (remaining.length === 0) fs.rmdirSync(dir);
      } catch {
        // best effort
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("llamacpp-models-list", () => {
    const sysInfo = getSystemInfo();
    return LLAMACPP_MODELS.map((m) => {
      const modelPath = resolveLlamacppModelPath(llamacppDataDir, m);
      const exists = fs.existsSync(modelPath);
      let size = 0;
      if (exists) {
        try {
          size = fs.statSync(modelPath).size;
        } catch {
          // ignore
        }
      }
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        sizeLabel: m.sizeLabel,
        contextLabel: m.contextLabel,
        downloaded: exists && size > 0,
        size,
        compatibility: getModelCompatibility(m, sysInfo),
        icon: m.icon,
        tag: m.tag,
      };
    });
  });

  ipcMain.handle("llamacpp-server-start", async (_evt, p?: { model?: string }) => {
    const modelId = (
      typeof p?.model === "string" ? p.model : (readActiveModelId(stateDir) ?? DEFAULT_LLAMACPP_MODEL_ID)
    ) as LlamacppModelId;
    const model = getLlamacppModelDef(modelId);
    const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);

    if (!fs.existsSync(modelPath)) {
      return { ok: false, error: `Model not downloaded: ${model.name}` };
    }

    const binPath = resolveServerBinPath(llamacppDataDir);
    if (!fs.existsSync(binPath)) {
      return { ok: false, error: "llama-server backend not downloaded" };
    }

    try {
      const sysInfo = getSystemInfo();
      const ctxLen = computeContextLength(sysInfo.totalRamGb, model);
      console.log(
        `[llamacpp] computed context length: ${ctxLen} (RAM=${sysInfo.totalRamGb}GB, model=${model.fileSizeGb}GB)`
      );
      const chatTemplateFile = resolveChatTemplatePath(model, {
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
      });
      const { port } = await startLlamacppServer(binPath, modelPath, {
        contextLength: ctxLen,
        modelId,
        chatTemplateFile,
        stateDir,
      });
      writeActiveModelId(stateDir, modelId);
      return { ok: true, port, modelId, modelName: model.name, contextLength: ctxLen };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("llamacpp-server-stop", async () => {
    try {
      await stopLlamacppServer();
      clearActiveModelId(stateDir);
      resetWarmupState();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("llamacpp-clear-active-model", async () => {
    try {
      clearActiveModelId(stateDir);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("llamacpp-server-status", async () => {
    const status = await getLlamacppServerStatus();
    const activeModelId = readActiveModelId(stateDir);
    return { ...status, activeModelId };
  });

  ipcMain.handle("llamacpp-set-active-model", async (_evt, p: { model: string }) => {
    const modelId = p.model as LlamacppModelId;
    const model = getLlamacppModelDef(modelId);
    const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);

    if (!fs.existsSync(modelPath)) {
      return { ok: false, error: `Model not downloaded: ${model.name}` };
    }

    const binPath = resolveServerBinPath(llamacppDataDir);
    if (!fs.existsSync(binPath)) {
      return { ok: false, error: "llama-server backend not downloaded" };
    }

    try {
      resetWarmupState();
      writeActiveModelId(stateDir, modelId);
      const sysInfo = getSystemInfo();
      const ctxLen = computeContextLength(sysInfo.totalRamGb, model);
      console.log(
        `[llamacpp] computed context length: ${ctxLen} (RAM=${sysInfo.totalRamGb}GB, model=${model.fileSizeGb}GB)`
      );
      const chatTemplateFile = resolveChatTemplatePath(model, {
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
      });
      const { port } = await startLlamacppServer(binPath, modelPath, {
        contextLength: ctxLen,
        modelId,
        chatTemplateFile,
        stateDir,
      });
      return { ok: true, port, modelId, modelName: model.name, contextLength: ctxLen };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("llamacpp-warmup-get", () => {
    return getWarmupState();
  });

  ipcMain.handle(
    "llamacpp-warmup-set",
    (_evt, p: { state: "idle" | "warming" | "done"; modelId: string | null }) => {
      setWarmupState(p.state, p.modelId);
      return { ok: true };
    }
  );

  const LLAMACPP_BASE_URL_MARKER = "127.0.0.1:18791";

  ipcMain.handle(
    "llamacpp-propagate-model",
    (_evt, p: { model: string }) => {
      const profiles = listProfiles(stateDir);
      const updated: string[] = [];

      for (const profile of profiles) {
        const configPath = path.join(profile.profileHome, "config.yaml");
        if (!fs.existsSync(configPath)) continue;

        try {
          const raw = fs.readFileSync(configPath, "utf-8");
          const doc = yaml.load(raw) as Record<string, unknown> | null;
          if (!doc || typeof doc !== "object") continue;

          const provider = doc.provider;
          const baseUrl = String(doc.base_url ?? "");

          if (provider !== "custom" || !baseUrl.includes(LLAMACPP_BASE_URL_MARKER)) continue;

          doc.model = p.model;

          const out = yaml.dump(doc, { lineWidth: -1, noRefs: true });
          fs.writeFileSync(configPath, out, "utf-8");
          updated.push(profile.name);
        } catch (err) {
          console.warn(`[llamacpp] propagate failed for profile ${profile.name}:`, err);
        }
      }

      console.log(`[llamacpp] propagated model to ${updated.length} profile(s): ${updated.join(", ") || "(none)"}`);
      return { ok: true, updatedProfiles: updated };
    },
  );
}
