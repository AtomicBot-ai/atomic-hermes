import { createAsyncThunk } from "@reduxjs/toolkit";
import { setMode } from "./configSlice";
import type { RootState, AppDispatch } from "../store";
import { persistMode, type HermesSetupMode } from "./mode-persistence";

export type SwitchModeParams = {
  port: number;
  target: HermesSetupMode;
};

export const switchMode = createAsyncThunk<
  void,
  SwitchModeParams,
  { state: RootState; dispatch: AppDispatch }
>("mode/switch", async ({ target }, thunkApi) => {
  const dispatch = thunkApi.dispatch;
  const current = thunkApi.getState().config.mode;

  if (current === target) return;

  dispatch(setMode(target));
  persistMode(target);
});
