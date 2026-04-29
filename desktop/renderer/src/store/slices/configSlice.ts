import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { getConfig } from "../../services/api";
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

export const syncConfigFromGateway = createAsyncThunk(
  "config/syncFromGateway",
  async (port: number) => {
    const snap = await getConfig(port);
    return {
      provider: snap.activeProvider || null,
      model: snap.activeModel || null,
      apiKeyConfigured: snap.hasApiKeys,
    };
  },
);

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
  extraReducers: (builder) => {
    builder.addCase(syncConfigFromGateway.fulfilled, (state, action) => {
      state.provider = action.payload.provider;
      state.model = action.payload.model;
      state.apiKeyConfigured = action.payload.apiKeyConfigured;
    });
  },
});

export const { setProvider, setModel, setApiKeyConfigured, setMode, resetConfig } =
  configSlice.actions;
export const configReducer = configSlice.reducer;
