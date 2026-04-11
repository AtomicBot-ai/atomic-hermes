import { configureStore } from "@reduxjs/toolkit";
import { configReducer } from "./slices/configSlice";
import { gatewayReducer } from "./slices/gatewaySlice";
import { onboardingReducer } from "./slices/onboardingSlice";
import { chatReducer } from "./slices/chatSlice";

export const store = configureStore({
  reducer: {
    config: configReducer,
    gateway: gatewayReducer,
    onboarding: onboardingReducer,
    chat: chatReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
