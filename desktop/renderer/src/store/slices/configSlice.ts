import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { readPersistedMode, type HermesSetupMode } from "./mode-persistence";

type ConfigState = {
  provider: string | null;
  model: string | null;
  apiKeyConfigured: boolean;
  mode: HermesSetupMode;
};

const initialState: ConfigState = {
  provider: null,
  model: null,
  apiKeyConfigured: false,
  mode: readPersistedMode() ?? "self-managed",
};

const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    setProvider(state, action: PayloadAction<string>) {
      state.provider = action.payload;
    },
    setModel(state, action: PayloadAction<string>) {
      state.model = action.payload;
    },
    setApiKeyConfigured(state, action: PayloadAction<boolean>) {
      state.apiKeyConfigured = action.payload;
    },
    setMode(state, action: PayloadAction<HermesSetupMode>) {
      state.mode = action.payload;
    },
    resetConfig() {
      return initialState;
    },
  },
});

export const { setProvider, setModel, setApiKeyConfigured, setMode, resetConfig } =
  configSlice.actions;
export const configReducer = configSlice.reducer;
