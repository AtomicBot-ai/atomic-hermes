import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type DesktopWarmupStatus = "idle" | "warming" | "ready" | "error";

type SliceState = {
  status: DesktopWarmupStatus;
  detail: string | null;
};

const initialState: SliceState = {
  status: "idle",
  detail: null,
};

const desktopWarmupSlice = createSlice({
  name: "desktopWarmup",
  initialState,
  reducers: {
    setWarmupStatus(
      state,
      action: PayloadAction<{ status: DesktopWarmupStatus; detail?: string | null }>,
    ) {
      state.status = action.payload.status;
      state.detail = action.payload.detail ?? null;
    },
    resetWarmupUi(state) {
      state.status = "idle";
      state.detail = null;
    },
  },
});

export const desktopWarmupActions = desktopWarmupSlice.actions;
export const desktopWarmupReducer = desktopWarmupSlice.reducer;
