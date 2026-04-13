import React from "react";
import { Navigate, Outlet, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { SpinningSplashLogo } from "@shared/kit";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { initGatewayState } from "@store/slices/gatewaySlice";
import { loadOnboardingState } from "@store/slices/onboardingSlice";
import { isBootstrapPath, routes } from "./routes";
import { SetupPage } from "../setup/SetupPage";
import { Sidebar } from "../sidebar/Sidebar";
import { ChatPage } from "../chat/ChatPage";
import { StartChatPage } from "../chat/StartChatPage";
import {
  AiModelsTab,
  PlaceholderTab,
  SettingsIndexRedirect,
  SettingsPage,
} from "../settings";
import a from "./App.module.css";

const SIDEBAR_OPEN_LS_KEY = "hermes:sidebar-open";

function readSidebarOpenFromStorage(): boolean {
  try {
    const v = localStorage.getItem(SIDEBAR_OPEN_LS_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
    return true;
  } catch {
    return true;
  }
}

function LoadingScreen() {
  return (
    <div className={a.UiCentered}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <SpinningSplashLogo />
        <div className="UiLoadingTitle">Starting Atomic Hermes...</div>
        <div className="UiLoadingSubtitle">Initializing backend services</div>
      </div>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  return (
    <div className={a.UiCentered}>
      <div className={a.UiCard}>
        <div className={a.UiCardTitle}>Atomic Hermes failed to start</div>
        <div className={a.UiCardSubtitle}>
          The backend process did not become available. Check the logs for details.
        </div>
        <pre>{error || "No details."}</pre>
      </div>
    </div>
  );
}

function ChatRoute() {
  const [searchParams] = useSearchParams();
  const session = searchParams.get("session");

  return session?.trim() ? <ChatPage /> : <StartChatPage />;
}

function SidebarLayout() {
  const [sidebarOpen, setSidebarOpen] = React.useState(readSidebarOpenFromStorage);

  React.useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_OPEN_LS_KEY, sidebarOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarOpen]);

  return (
    <div className={a.UiAppShell}>
      <div className={`${a.UiAppPage} ${a.UiChatLayout}`}>
        <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
        <div className={a.UiChatLayoutMain}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function App() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.gateway.state);
  const onboarded = useAppSelector((s) => s.onboarding.onboarded);
  const navigate = useNavigate();
  const didAutoNavRef = React.useRef(false);

  React.useEffect(() => {
    void dispatch(initGatewayState());
    void dispatch(loadOnboardingState());
  }, [dispatch]);

  React.useEffect(() => {
    if (!state) return;

    if (state.kind === "ready") {
      if (didAutoNavRef.current) return;
      didAutoNavRef.current = true;
      if (!onboarded) {
        void navigate(routes.setup, { replace: true });
      } else {
        void navigate(routes.chat, { replace: true });
      }
      return;
    }
    if (state.kind === "failed") {
      void navigate(routes.error, { replace: true });
    }
    if (state.kind === "starting") {
      void navigate(routes.loading, { replace: true });
    }
  }, [state, navigate, onboarded]);

  if (state?.kind === "ready") {
    return (
      <Routes>
        <Route path="setup/*" element={<SetupPage />} />
        <Route path="/" element={<SidebarLayout />}>
          <Route index element={<Navigate to={routes.chat} replace />} />
          <Route path="chat" element={<ChatRoute />} />
          <Route path="settings" element={<SettingsPage state={state} />}>
            <Route index element={<SettingsIndexRedirect />} />
            <Route path="ai-providers" element={<Navigate to={routes.settingsModels} replace />} />
            <Route path="ai-models" element={<AiModelsTab />} />
            <Route
              path="skills"
              element={
                <PlaceholderTab
                  title="Skills"
                  description="Browse and configure optional skills once Hermes exposes the required desktop state."
                />
              }
            />
            <Route
              path="messengers"
              element={
                <PlaceholderTab
                  title="Messengers"
                  description="Messaging connectors will appear here after Hermes adds desktop integration endpoints."
                />
              }
            />
            <Route
              path="voice"
              element={
                <PlaceholderTab
                  title="Voice"
                  description="Speech and transcription controls are reserved for a future Hermes desktop update."
                />
              }
            />
            <Route
              path="mcp-servers"
              element={
                <PlaceholderTab
                  title="MCP Servers"
                  description="Server registration, auth, and health controls will land here when the renderer gains MCP management APIs."
                />
              }
            />
            <Route
              path="account"
              element={
                <PlaceholderTab
                  title="Account"
                  description="Account-level desktop controls are planned but are not available in Hermes yet."
                />
              }
            />
            <Route
              path="other"
              element={
                <PlaceholderTab
                  title="Other"
                  description="Advanced, privacy, and maintenance settings will be wired here in a later pass."
                />
              }
            />
          </Route>
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
