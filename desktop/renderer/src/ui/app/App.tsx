import React from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { Brand, SpinningSplashLogo } from "@shared/kit";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { initGatewayState } from "@store/slices/gatewaySlice";
import { isBootstrapPath, routes } from "./routes";
import a from "./App.module.css";

function LoadingScreen() {
  return (
    <div className={a.UiCentered}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <SpinningSplashLogo />
        <div className="UiLoadingTitle">Starting Hermes Agent...</div>
        <div className="UiLoadingSubtitle">Initializing backend services</div>
      </div>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  return (
    <div className={a.UiCentered}>
      <div className={a.UiCard}>
        <div className={a.UiCardTitle}>Hermes Agent failed to start</div>
        <div className={a.UiCardSubtitle}>
          The backend process did not become available. Check the logs for details.
        </div>
        <pre>{error || "No details."}</pre>
      </div>
    </div>
  );
}

function MainLayout() {
  return (
    <div className={a.UiAppShell}>
      <div className={a.UiAppTopbar}>
        <NavLink to={routes.chat} className={a.UiAppNavLink}>
          <Brand />
        </NavLink>
        <div className={a.UiAppTopbarActions}>
          <NavLink to={routes.settings} className={a.UiAppNavLink}>
            Settings
          </NavLink>
        </div>
      </div>
      <div className={`${a.UiAppPage} ${a.UiMainLayout}`}>
        <div className={a.UiMainLayoutMain}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function ChatPlaceholder() {
  return (
    <div className={a.UiCentered}>
      <div style={{ textAlign: "center", opacity: 0.6 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚕</div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Hermes Agent</h2>
        <p style={{ fontSize: 14 }}>Chat interface will be here</p>
      </div>
    </div>
  );
}

function SettingsPlaceholder() {
  return (
    <div className={a.UiCentered}>
      <div style={{ textAlign: "center", opacity: 0.6 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Settings</h2>
        <p style={{ fontSize: 14 }}>Settings interface will be here</p>
      </div>
    </div>
  );
}

export function App() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.gateway.state);
  const navigate = useNavigate();
  const didAutoNavRef = React.useRef(false);

  React.useEffect(() => {
    void dispatch(initGatewayState());
  }, [dispatch]);

  React.useEffect(() => {
    if (!state) return;

    if (state.kind === "ready") {
      if (didAutoNavRef.current) return;
      didAutoNavRef.current = true;
      void navigate(routes.chat, { replace: true });
      return;
    }
    if (state.kind === "failed") {
      void navigate(routes.error, { replace: true });
    }
    if (state.kind === "starting") {
      void navigate(routes.loading, { replace: true });
    }
  }, [state, navigate]);

  if (state?.kind === "ready") {
    return (
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to={routes.chat} replace />} />
          <Route path="chat" element={<ChatPlaceholder />} />
          <Route path="settings" element={<SettingsPlaceholder />} />
        </Route>
        <Route path="*" element={<Navigate to={routes.chat} replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path={routes.loading} element={<LoadingScreen />} />
      <Route
        path={routes.error}
        element={
          state?.kind === "failed" ? (
            <ErrorScreen error={state.error} />
          ) : (
            <Navigate to={routes.loading} replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={routes.loading} replace />} />
    </Routes>
  );
}
