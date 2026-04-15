import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { HashRouter } from "react-router-dom";
import { App } from "./ui/app/App";
import { ErrorBoundary } from "./ui/app/ErrorBoundary";
import { Toaster } from "./ui/shared/Toaster";
import { store } from "./store/store";
import "./ui/styles/index.css";

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
