import { configureStore } from "@reduxjs/toolkit";
import { configReducer } from "./slices/configSlice";
import { gatewayReducer } from "./slices/gatewaySlice";

export const store = configureStore({
  reducer: {
    config: configReducer,
    gateway: gatewayReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
