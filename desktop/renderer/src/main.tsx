import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { HashRouter } from "react-router-dom";
import { App } from "./ui/app/App";
import { ErrorBoundary } from "./ui/app/ErrorBoundary";
import { Toaster } from "./ui/shared/Toaster";
import { store } from "./store/store";
import { initPosthogRenderer } from "@analytics";
import "./ui/styles/index.css";

void (async () => {
  try {
    const api = (window as any).hermesAPI;
    if (api?.analyticsGet) {
      const { enabled, userId } = await api.analyticsGet();
      initPosthogRenderer(userId, enabled);
    }
  } catch {
    // Analytics init failure is non-critical; the app continues normally.
  }
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster />
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
