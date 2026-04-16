import React from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import { desktopWarmupActions } from "@store/slices/desktopWarmupSlice";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { getBaseUrl } from "../../../services/api";
import {
  resolveDesktopWarmupEphemeralSystemPrompt,
} from "../../../services/chat-session";

const POLL_MS = 2000;
const CUSTOM_WARMUP_COOLDOWN_MS = 60_000;

function readCustomModelDefault(cfg: Record<string, unknown> | undefined): string {
  const m = cfg?.model;
  if (typeof m === "string") return m.trim();
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const o = m as Record<string, unknown>;
    return String(o.default ?? o.model ?? "").trim();
  }
  return "";
}

type WarmupJson = {
  ok?: boolean;
  skipped?: boolean;
  warmed?: boolean;
  reason?: string;
  error?: string;
  model?: string;
  base_url?: string;
  detail?: string | unknown[];
};

/**
 * Triggers a lightweight OpenAI-compatible warmup for local models (desktop bridge).
 * Uses Electron main-process warmup state when available (survives renderer reload).
 */
export function useDesktopLocalWarmup(): void {
  const dispatch = useAppDispatch();
  const gateway = useAppSelector((s) => s.gateway.state);
  const bridgePort = gateway?.kind === "ready" ? gateway.port : null;
  const activeModelId = useAppSelector((s) => s.llamacpp?.activeModelId ?? null);

  const triggeredRef = React.useRef(false);
  const lastCustomAttemptRef = React.useRef(0);
  const warmedModelRef = React.useRef<string | null>(null);
  const forceNextRef = React.useRef(false);

  React.useEffect(() => {
    if (!bridgePort) return;
    dispatch(desktopWarmupActions.resetWarmupUi());
    triggeredRef.current = false;
    warmedModelRef.current = null;
    forceNextRef.current = false;
    lastCustomAttemptRef.current = 0;
  }, [bridgePort, dispatch]);

  React.useEffect(() => {
    if (!bridgePort) return;

    if (activeModelId && warmedModelRef.current && warmedModelRef.current !== activeModelId) {
      triggeredRef.current = false;
      forceNextRef.current = true;
      lastCustomAttemptRef.current = 0;
      dispatch(desktopWarmupActions.setWarmupStatus({ status: "warming" }));
    }

    const api = getDesktopApiOrNull();
    let cancelled = false;

    const postWarmup = async (body: Record<string, unknown>): Promise<WarmupJson> => {
      const urlPrimary = `${getBaseUrl(bridgePort)}/warmup`;
      let res = await fetch(urlPrimary, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const statusPrimary = res.status;
      let statusAlias: number | null = null;
      if (res.status === 404) {
        res = await fetch(`${getBaseUrl(bridgePort)}/api/warmup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        statusAlias = res.status;
      }
      const data = (await res.json().catch(() => ({}))) as WarmupJson & { detail?: unknown };
      const fastapiDetail = data.detail;
      const detailStr =
        typeof fastapiDetail === "string"
          ? fastapiDetail
          : Array.isArray(fastapiDetail)
            ? fastapiDetail.map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg?: string }).msg) : JSON.stringify(x))).join("; ")
            : undefined;
      const logicalOk = typeof data.ok === "boolean" ? data.ok : res.ok;
      const mergedError =
        data.error ??
        detailStr ??
        (!res.ok ? `HTTP ${res.status}` : undefined);
      return {
        ...data,
        ok: logicalOk,
        error: mergedError,
      };
    };

    const tick = async () => {
      if (cancelled || triggeredRef.current) return;

      const markDone = async (modelId: string) => {
        triggeredRef.current = true;
        warmedModelRef.current = modelId;
        dispatch(desktopWarmupActions.setWarmupStatus({ status: "ready" }));
        await api?.llamacppWarmupSet?.({ state: "done", modelId });
      };

      if (api?.llamacppWarmupGet) {
        try {
          const main = await api.llamacppWarmupGet();
          if (main.state === "done" && main.modelId) {
            let matches = false;
            try {
              const st = await api.llamacppServerStatus?.();
              if (st?.healthy && st?.running && st.activeModelId === main.modelId) {
                matches = true;
              }
            } catch {
              // ignore
            }
            if (!matches) {
              try {
                const r = await fetch(`${getBaseUrl(bridgePort)}/config`);
                const j = (await r.json()) as { config?: Record<string, unknown> };
                const def = readCustomModelDefault(j.config);
                if (def && def === main.modelId) matches = true;
              } catch {
                // ignore
              }
            }
            if (matches) {
              dispatch(desktopWarmupActions.setWarmupStatus({ status: "ready" }));
              triggeredRef.current = true;
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      let serverStatus: {
        running: boolean;
        healthy: boolean;
        port: number;
        activeModelId: string | null;
      } | null = null;
      try {
        serverStatus = api?.llamacppServerStatus ? await api.llamacppServerStatus() : null;
      } catch {
        serverStatus = null;
      }

      if (serverStatus?.healthy && serverStatus.running && serverStatus.activeModelId) {
        const baseUrl = `http://127.0.0.1:${serverStatus.port}/v1`;
        const model = serverStatus.activeModelId;
        triggeredRef.current = true;
        dispatch(desktopWarmupActions.setWarmupStatus({ status: "warming" }));
        await api?.llamacppWarmupSet?.({ state: "warming", modelId: model });

        const ephem = resolveDesktopWarmupEphemeralSystemPrompt();
        const useForce = forceNextRef.current;
        forceNextRef.current = false;
        const warmupBody: Record<string, unknown> = {
          base_url: baseUrl,
          model,
          api_key: "",
          ephemeral_system_prompt: ephem,
          ...(useForce ? { force: true } : {}),
        };
        const out = await postWarmup(warmupBody);
        if (cancelled) return;

        if (out.ok && (out.warmed || (out.skipped && out.reason === "already_warmed"))) {
          const id = out.model ?? model;
          await markDone(id);
          return;
        }

        await api?.llamacppWarmupSet?.({ state: "idle", modelId: null });
        dispatch(
          desktopWarmupActions.setWarmupStatus({
            status: "error",
            detail:
              out.error ??
              out.reason ??
              (typeof out.ok === "boolean" && !out.ok ? "bridge returned ok=false" : null) ??
              "warmup failed",
          }),
        );
        triggeredRef.current = false;
        return;
      }

      const now = Date.now();
      if (now - lastCustomAttemptRef.current < CUSTOM_WARMUP_COOLDOWN_MS) return;
      lastCustomAttemptRef.current = now;

      const ephemCfg = resolveDesktopWarmupEphemeralSystemPrompt();
      const outCfg = await postWarmup({ ephemeral_system_prompt: ephemCfg });
      if (cancelled) return;

      if (outCfg.ok && outCfg.warmed && outCfg.model) {
        dispatch(desktopWarmupActions.setWarmupStatus({ status: "warming" }));
        await markDone(outCfg.model);
        return;
      }

      if (outCfg.ok && outCfg.skipped && outCfg.reason === "already_warmed" && outCfg.model) {
        await markDone(outCfg.model);
        return;
      }

      if (outCfg.ok && outCfg.skipped && (outCfg.reason === "not_applicable" || outCfg.reason === "disabled_by_env")) {
        return;
      }

      if (!outCfg.ok || (outCfg.ok === true && outCfg.warmed === false && !outCfg.skipped)) {
        dispatch(
          desktopWarmupActions.setWarmupStatus({
            status: "error",
            detail: outCfg.error ?? "warmup failed",
          }),
        );
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [bridgePort, activeModelId, dispatch]);
}
