import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export type GatewayState =
  | { kind: "starting" }
  | { kind: "restarting" }
  | { kind: "ready"; port: number }
  | { kind: "failed"; error: string };

type SliceState = {
  state: GatewayState | null;
};

const initialState: SliceState = {
  state: null,
};

export const initGatewayState = createAsyncThunk(
  "gateway/init",
  async (_, { dispatch }) => {
    const api = (window as any).hermesAPI;
    if (!api) return { kind: "starting" as const };

    api.onPythonRestarting?.(() => {
      dispatch(setGatewayRestarting());
    });

    api.onPythonReady?.(async () => {
      const port = await api.getPort();
      if (typeof port === "number" && port > 0) {
        dispatch(setGatewayReady(port));
      }
    });

    // After a page reload the backend is already running but the one-shot
    // "python-ready" IPC event won't fire again.  Try getPort() first —
    // if it succeeds the gateway is already up.
    try {
      const port = await api.getPort();
      if (typeof port === "number" && port > 0) {
        return { kind: "ready" as const, port };
      }
    } catch {
      // getPort() failed — backend not ready yet, fall through to event listeners.
    }

    return new Promise<GatewayState>((resolve) => {
      api.onPythonReady(async () => {
        const port = await api.getPort();
        resolve({ kind: "ready", port });
      });
      api.onPythonError((error: string) => {
        resolve({ kind: "failed", error });
      });
    });
  },
);

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
    setGatewayRestarting(state) {
      state.state = { kind: "restarting" };
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

export const { setGatewayReady, setGatewayFailed, setGatewayRestarting } = gatewaySlice.actions;
export const gatewayReducer = gatewaySlice.reducer;
