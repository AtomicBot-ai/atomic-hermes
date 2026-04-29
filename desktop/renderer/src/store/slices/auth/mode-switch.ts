/**
 * Unified mode-switching orchestrator (openclaw parity).
 * Each mode implements symmetric saveBackup / teardown / setup phases.
 */
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "../../store";
import { setMode, syncConfigFromGateway } from "../configSlice";
import { persistMode, type HermesSetupMode } from "../mode-persistence";
import {
  applyPaygKey,
  atomicAuthActions,
  storeAtomicToken,
} from "../atomicAuthSlice";
import { fetchLlamacppServerStatus } from "../llamacppSlice";
import type { SwitchModeParams, ModeSetupResult } from "./auth-types";
import { atomicPaygHandler } from "./mode-handler-atomic-payg";
import { selfManagedHandler } from "./mode-handler-self-managed";
import { localModelHandler } from "./mode-handler-local-model";

const handlers: Record<HermesSetupMode, ModeHandler> = {
  "atomic-payg": atomicPaygHandler,
  "self-managed": selfManagedHandler,
  "local-model": localModelHandler,
};

export type { SwitchModeParams } from "./auth-types";

export const switchMode = createAsyncThunk<
  ModeSetupResult | void,
  SwitchModeParams,
  { state: RootState; dispatch: AppDispatch }
>("mode/switch", async ({ port, target }, thunkApi) => {
  const dispatch = thunkApi.dispatch;
  const getState = thunkApi.getState;
  const current = getState().config.mode;

  if (current === target) {
    return;
  }

  const ctx: SwitchContext = { dispatch, getState, port };

  if (current) {
    await handlers[current].saveBackup(ctx);
    await handlers[current].teardown(ctx);
  }

  dispatch(atomicAuthActions.clearSliceAuthForModeSwitch());

  const result: ModeSetupResult = await handlers[target].setup(ctx);

  dispatch(setMode(target));
  persistMode(target);

  if (result.restoredAuth) {
    dispatch(atomicAuthActions.setRestoredAuth(result.restoredAuth));
    try {
      await dispatch(
        storeAtomicToken({
          jwt: result.restoredAuth.jwt,
          email: result.restoredAuth.email,
          userId: result.restoredAuth.userId,
        }),
      ).unwrap();
    } catch (err) {
      console.warn("[switchMode] storeAtomicToken after restore failed:", err);
    }
  }

  if (result.needsApplyPaygKey) {
    try {
      await dispatch(applyPaygKey({ port })).unwrap();
    } catch (err) {
      console.warn("[switchMode] applyPaygKey failed:", err);
    }
  }

  try {
    await dispatch(syncConfigFromGateway(port)).unwrap();
  } catch (err) {
    console.warn("[switchMode] syncConfigFromGateway failed:", err);
  }

  void dispatch(fetchLlamacppServerStatus());
  document.dispatchEvent(new Event("hermes-config-changed"));

  return result;
});
