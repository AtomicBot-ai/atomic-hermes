import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  atomicBackendApi,
  isUnauthorizedError,
  type BalanceResponse,
  type SubscriptionPlan,
} from "../../services/atomic-backend-api";
import {
  clearAtomicAuth as clearAtomicAuthStorage,
  readAtomicAuth as readAtomicAuthStorage,
  writeAtomicAuth as writeAtomicAuthStorage,
} from "../../services/atomic-auth-storage";
import { patchConfig } from "../../services/api";
import type { AppDispatch, RootState } from "../store";

export type AtomicAuthSliceState = {
  jwt: string | null;
  email: string | null;
  userId: string | null;
  subscriptionPlan: SubscriptionPlan | null;
  balance: BalanceResponse | null;

  /** True while restoreAtomicAuth is reading JWT from local storage. */
  restoreLoading: boolean;
  restoreLoaded: boolean;

  /** True while applyPaygKey thunk is running. */
  applyKeyBusy: boolean;
  applyKeyError: string | null;

  /** True while fetchAtomicBalance is running. */
  balanceLoading: boolean;
  balanceError: string | null;

  /** True while createPaygTopup is in flight. */
  topupBusy: boolean;
  topupError: string | null;
  /** True while waiting for the user to complete Stripe Checkout. */
  topupPending: boolean;
};

const initialState: AtomicAuthSliceState = {
  jwt: null,
  email: null,
  userId: null,
  subscriptionPlan: null,
  balance: null,

  restoreLoading: false,
  restoreLoaded: false,

  applyKeyBusy: false,
  applyKeyError: null,

  balanceLoading: false,
  balanceError: null,

  topupBusy: false,
  topupError: null,
  topupPending: false,
};

export type StoredTokenPayload = {
  jwt: string;
  email: string;
  userId: string;
  isNewUser?: boolean;
};

/**
 * On app startup: read JWT from `window.localStorage`. Does not call the
 * backend — that happens lazily in `verifyAtomicAuth` once the user enters
 * a screen that needs a fresh balance / plan.
 */
export const restoreAtomicAuth = createAsyncThunk<
  { jwt: string; email: string; userId: string } | null,
  void
>("atomicAuth/restore", async () => {
  const stored = readAtomicAuthStorage();
  if (!stored?.jwt || !stored?.userId) return null;
  return { jwt: stored.jwt, email: stored.email ?? "", userId: stored.userId };
});

/**
 * Persist the JWT received from the OAuth deep link (atomicbot-hermes://auth?token=...).
 */
export const storeAtomicToken = createAsyncThunk<
  StoredTokenPayload,
  StoredTokenPayload
>("atomicAuth/store", async (payload) => {
  writeAtomicAuthStorage({
    jwt: payload.jwt,
    email: payload.email,
    userId: payload.userId,
  });
  return payload;
});

export const clearAtomicAuthThunk = createAsyncThunk<void, void>(
  "atomicAuth/clear",
  async () => {
    clearAtomicAuthStorage();
  },
);

/**
 * Verify the cached JWT against /auth/me. On 401 the slice automatically
 * clears local state — caller should redirect to sign-in.
 */
export const verifyAtomicAuth = createAsyncThunk<
  { plan: SubscriptionPlan } | null,
  void,
  { state: RootState; dispatch: AppDispatch }
>("atomicAuth/verify", async (_arg, thunkApi) => {
  const jwt = thunkApi.getState().atomicAuth.jwt;
  if (!jwt) return null;
  try {
    const me = await atomicBackendApi.getMe(jwt);
    return { plan: me.subscriptionPlan };
  } catch (err) {
    if (isUnauthorizedError(err)) {
      await thunkApi.dispatch(clearAtomicAuthThunk()).unwrap();
      return thunkApi.rejectWithValue("unauthorized") as never;
    }
    throw err;
  }
});

/**
 * Fetch /billing/payg/key, push the resulting OpenRouter key into the local
 * Hermes gateway via PATCH /api/config (env: OPENROUTER_API_KEY +
 * config: provider=openrouter). On the next chat turn the gateway picks up
 * the freshly-written key from its env file.
 */
export const applyPaygKey = createAsyncThunk<
  { remaining: number; limit: number },
  { port: number },
  { state: RootState; rejectValue: string }
>("atomicAuth/applyPaygKey", async ({ port }, thunkApi) => {
  const jwt = thunkApi.getState().atomicAuth.jwt;
  if (!jwt) {
    return thunkApi.rejectWithValue("Not authenticated");
  }

  const result = await atomicBackendApi.getPaygKey(jwt);
  if (!result?.key) {
    return thunkApi.rejectWithValue("PAYG key missing in backend response");
  }

  await patchConfig(port, {
    config: { provider: "openrouter" },
    env: { OPENROUTER_API_KEY: result.key },
  });

  return { remaining: result.remaining, limit: result.limit };
});

export const fetchAtomicBalance = createAsyncThunk<
  BalanceResponse,
  { sync?: boolean } | undefined,
  { state: RootState; rejectValue: string }
>("atomicAuth/fetchBalance", async (arg, thunkApi) => {
  const jwt = thunkApi.getState().atomicAuth.jwt;
  if (!jwt) return thunkApi.rejectWithValue("Not authenticated");
  return atomicBackendApi.getBalance(jwt, { sync: arg?.sync });
});

const atomicAuthSlice = createSlice({
  name: "atomicAuth",
  initialState,
  reducers: {
    clearSliceAuthForModeSwitch(state) {
      state.jwt = null;
      state.email = null;
      state.userId = null;
      state.subscriptionPlan = null;
      state.balance = null;
      state.applyKeyBusy = false;
      state.applyKeyError = null;
      state.balanceLoading = false;
      state.balanceError = null;
    },
    setRestoredAuth(state, action: PayloadAction<{ jwt: string; email: string; userId: string }>) {
      state.jwt = action.payload.jwt;
      state.email = action.payload.email;
      state.userId = action.payload.userId;
    },
    setTopupPending(state, action: PayloadAction<boolean>) {
      state.topupPending = action.payload;
    },
    setTopupError(state, action: PayloadAction<string | null>) {
      state.topupError = action.payload;
    },
    setTopupBusy(state, action: PayloadAction<boolean>) {
      state.topupBusy = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreAtomicAuth.pending, (state) => {
        state.restoreLoading = true;
      })
      .addCase(restoreAtomicAuth.fulfilled, (state, action) => {
        state.restoreLoading = false;
        state.restoreLoaded = true;
        if (action.payload) {
          state.jwt = action.payload.jwt;
          state.email = action.payload.email;
          state.userId = action.payload.userId;
        }
      })
      .addCase(restoreAtomicAuth.rejected, (state) => {
        state.restoreLoading = false;
        state.restoreLoaded = true;
      });

    builder.addCase(storeAtomicToken.fulfilled, (state, action) => {
      state.jwt = action.payload.jwt;
      state.email = action.payload.email;
      state.userId = action.payload.userId;
    });

    builder.addCase(clearAtomicAuthThunk.fulfilled, () => initialState);

    builder
      .addCase(verifyAtomicAuth.fulfilled, (state, action) => {
        if (action.payload?.plan) {
          state.subscriptionPlan = action.payload.plan;
        }
      });

    builder
      .addCase(applyPaygKey.pending, (state) => {
        state.applyKeyBusy = true;
        state.applyKeyError = null;
      })
      .addCase(applyPaygKey.fulfilled, (state, action) => {
        state.applyKeyBusy = false;
        if (state.balance?.payg) {
          state.balance = {
            ...state.balance,
            payg: {
              ...state.balance.payg,
              remaining: action.payload.remaining,
              limit: action.payload.limit,
            },
          };
        }
      })
      .addCase(applyPaygKey.rejected, (state, action) => {
        state.applyKeyBusy = false;
        state.applyKeyError =
          (action.payload as string | undefined) ?? action.error.message ?? "Failed to apply PAYG key";
      });

    builder
      .addCase(fetchAtomicBalance.pending, (state) => {
        state.balanceLoading = true;
        state.balanceError = null;
      })
      .addCase(fetchAtomicBalance.fulfilled, (state, action) => {
        state.balanceLoading = false;
        state.balance = action.payload;
        state.subscriptionPlan = action.payload.subscriptionPlan;
      })
      .addCase(fetchAtomicBalance.rejected, (state, action) => {
        state.balanceLoading = false;
        state.balanceError =
          (action.payload as string | undefined) ?? action.error.message ?? "Failed to load balance";
      });
  },
});

export const atomicAuthActions = atomicAuthSlice.actions;
export const atomicAuthReducer = atomicAuthSlice.reducer;
