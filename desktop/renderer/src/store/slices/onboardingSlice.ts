import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

type OnboardingState = {
  onboarded: boolean;
};

function getHermesAPI(): any {
  return typeof window !== "undefined" ? (window as any).hermesAPI : null;
}

export const loadOnboardingState = createAsyncThunk(
  "onboarding/load",
  async (_: void, thunkApi) => {
    const api = getHermesAPI();
    let onboarded = false;

    if (api?.getOnboardingState) {
      try {
        const state = await api.getOnboardingState();
        onboarded = state?.onboarded === true;
      } catch {
        // IPC unavailable
      }
    }

    thunkApi.dispatch(onboardingSlice.actions._setOnboardedState(onboarded));
  },
);

export const setOnboarded = createAsyncThunk(
  "onboarding/setOnboarded",
  async (onboarded: boolean, thunkApi) => {
    const api = getHermesAPI();
    if (api?.setOnboardingState) {
      try {
        await api.setOnboardingState(onboarded);
      } catch (err) {
        console.warn("[onboardingSlice] Failed to persist state:", err);
      }
    }

    thunkApi.dispatch(onboardingSlice.actions._setOnboardedState(onboarded));
  },
);

const initialState: OnboardingState = {
  onboarded: false,
};

const onboardingSlice = createSlice({
  name: "onboarding",
  initialState,
  reducers: {
    _setOnboardedState(state, action: { payload: boolean }) {
      state.onboarded = action.payload;
    },
  },
});

export const onboardingReducer = onboardingSlice.reducer;
