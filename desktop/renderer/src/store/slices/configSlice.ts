import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type ConfigState = {
  provider: string | null;
  model: string | null;
  apiKeyConfigured: boolean;
};

const initialState: ConfigState = {
  provider: null,
  model: null,
  apiKeyConfigured: false,
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
    resetConfig() {
      return initialState;
    },
  },
});

export const { setProvider, setModel, setApiKeyConfigured, resetConfig } = configSlice.actions;
export const configReducer = configSlice.reducer;
