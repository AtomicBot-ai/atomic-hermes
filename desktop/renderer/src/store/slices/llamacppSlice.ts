import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import {
  getDesktopApi,
  type LlamacppModelListEntry,
  type LlamacppServerStatusResponse,
  type LlamacppSystemInfoResponse,
  type LlamacppBackendStatusResponse,
  type ModelCompatibility,
} from "../../ipc/desktopApi";

type ModelDownloadState =
  | { kind: "idle" }
  | { kind: "downloading"; modelId: string; percent: number }
  | { kind: "error"; message: string };

type BackendDownloadState =
  | { kind: "idle" }
  | { kind: "downloading"; percent: number }
  | { kind: "error"; message: string };

export type LlamacppState = {
  systemInfo: LlamacppSystemInfoResponse | null;
  backendDownloaded: boolean;
  backendVersion: string | null;
  backendDownload: BackendDownloadState;
  models: LlamacppModelListEntry[];
  modelDownload: ModelDownloadState;
  serverStatus: LlamacppServerStatusResponse | null;
  activeModelId: string | null;
};

const initialState: LlamacppState = {
  systemInfo: null,
  backendDownloaded: false,
  backendVersion: null,
  backendDownload: { kind: "idle" },
  models: [],
  modelDownload: { kind: "idle" },
  serverStatus: null,
  activeModelId: null,
};

export const fetchLlamacppSystemInfo = createAsyncThunk(
  "llamacpp/fetchSystemInfo",
  async () => {
    const api = getDesktopApi();
    return api.llamacppSystemInfo!();
  }
);

export const fetchLlamacppBackendStatus = createAsyncThunk(
  "llamacpp/fetchBackendStatus",
  async () => {
    const api = getDesktopApi();
    return api.llamacppBackendStatus!();
  }
);

export const fetchLlamacppModels = createAsyncThunk(
  "llamacpp/fetchModels",
  async () => {
    const api = getDesktopApi();
    return api.llamacppModelsList!();
  }
);

export const fetchLlamacppServerStatus = createAsyncThunk(
  "llamacpp/fetchServerStatus",
  async () => {
    const api = getDesktopApi();
    return api.llamacppServerStatus!();
  }
);

export const downloadLlamacppBackend = createAsyncThunk(
  "llamacpp/downloadBackend",
  async (_, thunkApi) => {
    const api = getDesktopApi();

    thunkApi.dispatch(llamacppActions.setBackendDownload({ kind: "downloading", percent: 0 }));

    const unsub = api.onLlamacppBackendDownloadProgress?.((payload) => {
      thunkApi.dispatch(
        llamacppActions.setBackendDownload({ kind: "downloading", percent: payload.percent }),
      );
    });

    try {
      const result = await api.llamacppBackendDownload!();
      unsub?.();
      if (!result.ok) {
        return thunkApi.rejectWithValue(result.error ?? "Download failed");
      }
      void thunkApi.dispatch(fetchLlamacppBackendStatus());
      return result;
    } catch (err) {
      unsub?.();
      return thunkApi.rejectWithValue(err instanceof Error ? err.message : "Download failed");
    }
  },
);

export const checkLlamacppBackendUpdate = createAsyncThunk(
  "llamacpp/checkBackendUpdate",
  async () => {
    const api = getDesktopApi();
    return api.llamacppBackendUpdate!();
  }
);

export const cancelLlamacppBackendDownload = createAsyncThunk(
  "llamacpp/cancelBackendDownload",
  async (_, thunkApi) => {
    const api = getDesktopApi();
    await api.llamacppBackendDownloadCancel?.();
    thunkApi.dispatch(llamacppActions.setBackendDownload({ kind: "idle" }));
  },
);

export const downloadLlamacppModel = createAsyncThunk(
  "llamacpp/downloadModel",
  async (modelId: string, thunkApi) => {
    const api = getDesktopApi();

    thunkApi.dispatch(
      llamacppActions.setModelDownload({ kind: "downloading", modelId, percent: 0 }),
    );

    const unsub = api.onLlamacppModelDownloadProgress?.((payload) => {
      thunkApi.dispatch(
        llamacppActions.setModelDownload({
          kind: "downloading",
          modelId: payload.modelId,
          percent: payload.percent,
        }),
      );
    });

    try {
      const result = await api.llamacppModelDownload!(modelId);
      unsub?.();
      if (!result.ok) {
        return thunkApi.rejectWithValue(result.error ?? "Download failed");
      }
      void thunkApi.dispatch(fetchLlamacppModels());
      return { ...result, modelId };
    } catch (err) {
      unsub?.();
      return thunkApi.rejectWithValue(err instanceof Error ? err.message : "Download failed");
    }
  },
);

export const cancelLlamacppModelDownload = createAsyncThunk(
  "llamacpp/cancelModelDownload",
  async () => {
    const api = getDesktopApi();
    return api.llamacppModelDownloadCancel!();
  }
);

export const setLlamacppActiveModel = createAsyncThunk(
  "llamacpp/setActiveModel",
  async (modelId: string, { dispatch }) => {
    const api = getDesktopApi();
    const result = await api.llamacppSetActiveModel!(modelId);
    if (result.ok) {
      void dispatch(fetchLlamacppServerStatus());
      void dispatch(fetchLlamacppModels());
    }
    return result;
  }
);

export const stopLlamacppServer = createAsyncThunk(
  "llamacpp/stopServer",
  async (_, { dispatch }) => {
    const api = getDesktopApi();
    const result = await api.llamacppServerStop!();
    if (result.ok) {
      dispatch(llamacppActions.setActiveModelId(null));
      void dispatch(fetchLlamacppServerStatus());
    }
    return result;
  },
);

export const deleteLlamacppModel = createAsyncThunk(
  "llamacpp/deleteModel",
  async (modelId: string, { dispatch }) => {
    const api = getDesktopApi();
    const result = await api.llamacppModelDelete!(modelId);
    if (result.ok) {
      void dispatch(fetchLlamacppModels());
      void dispatch(fetchLlamacppServerStatus());
    }
    return result;
  }
);

const llamacppSlice = createSlice({
  name: "llamacpp",
  initialState,
  reducers: {
    setModelDownload(state, action: PayloadAction<ModelDownloadState>) {
      state.modelDownload = action.payload;
    },
    setBackendDownload(state, action: PayloadAction<BackendDownloadState>) {
      state.backendDownload = action.payload;
    },
    setModelDownloadProgress(
      state,
      action: PayloadAction<{ percent: number; modelId: string }>
    ) {
      state.modelDownload = {
        kind: "downloading",
        modelId: action.payload.modelId,
        percent: action.payload.percent,
      };
    },
    setBackendDownloadProgress(
      state,
      action: PayloadAction<{ percent: number }>
    ) {
      state.backendDownload = {
        kind: "downloading",
        percent: action.payload.percent,
      };
    },
    setActiveModelId(state, action: PayloadAction<string | null>) {
      state.activeModelId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLlamacppSystemInfo.fulfilled, (state, action) => {
        state.systemInfo = action.payload;
      })
      .addCase(fetchLlamacppBackendStatus.fulfilled, (state, action) => {
        state.backendDownloaded = action.payload.downloaded;
        state.backendVersion = action.payload.version;
      })
      .addCase(fetchLlamacppModels.fulfilled, (state, action) => {
        state.models = action.payload;
      })
      .addCase(fetchLlamacppServerStatus.fulfilled, (state, action) => {
        state.serverStatus = action.payload;
        state.activeModelId = action.payload.activeModelId;
      })
      .addCase(downloadLlamacppBackend.fulfilled, (state) => {
        state.backendDownloaded = true;
        state.backendDownload = { kind: "idle" };
      })
      .addCase(downloadLlamacppBackend.rejected, (state, action) => {
        const msg = String(action.payload ?? action.error.message ?? "Download failed");
        if (msg === "cancelled") {
          state.backendDownload = { kind: "idle" };
          return;
        }
        state.backendDownload = { kind: "error", message: msg };
      })
      .addCase(downloadLlamacppModel.fulfilled, (state) => {
        state.modelDownload = { kind: "idle" };
      })
      .addCase(downloadLlamacppModel.rejected, (state, action) => {
        const msg = String(action.payload ?? action.error.message ?? "Download failed");
        if (msg === "cancelled") {
          state.modelDownload = { kind: "idle" };
          return;
        }
        state.modelDownload = { kind: "error", message: msg };
      })
      .addCase(cancelLlamacppModelDownload.fulfilled, (state) => {
        state.modelDownload = { kind: "idle" };
      })
      .addCase(cancelLlamacppBackendDownload.fulfilled, (state) => {
        state.backendDownload = { kind: "idle" };
      })
      .addCase(setLlamacppActiveModel.fulfilled, (state, action) => {
        if (action.payload.ok && action.payload.modelId) {
          state.activeModelId = action.payload.modelId;
        }
      });
  },
});

export const llamacppActions = llamacppSlice.actions;
export const llamacppReducer = llamacppSlice.reducer;
