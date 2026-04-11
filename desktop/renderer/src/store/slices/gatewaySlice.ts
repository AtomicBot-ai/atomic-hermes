import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export type GatewayState =
  | { kind: "starting" }
  | { kind: "ready"; port: number }
  | { kind: "failed"; error: string };

type SliceState = {
  state: GatewayState | null;
};

const initialState: SliceState = {
  state: null,
};

export const initGatewayState = createAsyncThunk("gateway/init", async () => {
  const api = (window as any).hermesAPI;
  if (!api) return { kind: "starting" as const };

  return new Promise<GatewayState>((resolve) => {
    api.onPythonReady(async () => {
      const port = await api.getPort();
      resolve({ kind: "ready", port });
    });
    api.onPythonError((error: string) => {
      resolve({ kind: "failed", error });
    });
  });
});

const gatewaySlice = createSlice({
  name: "gateway",
  initialState,
  reducers: {
    setGatewayReady(state, action) {
      state.state = { kind: "ready", port: action.payload };
    },
    setGatewayFailed(state, action) {
      state.state = { kind: "failed", error: action.payload };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(initGatewayState.pending, (state) => {
      state.state = { kind: "starting" };
    });
    builder.addCase(initGatewayState.fulfilled, (state, action) => {
      state.state = action.payload;
    });
  },
});

export const { setGatewayReady, setGatewayFailed } = gatewaySlice.actions;
export const gatewayReducer = gatewaySlice.reducer;
