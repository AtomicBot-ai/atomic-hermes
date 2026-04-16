import React from "react";
import { Navigate, Outlet, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { Brand, SpinningSplashLogo } from "@shared/kit";
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
  McpServersTab,
  OtherTab,
  PlaceholderTab,
  SettingsIndexRedirect,
  SettingsPage,
} from "../settings";
import { ConnectorsTab } from "../settings/connectors/ConnectorsTab";
import { SkillsSettingsTab } from "../settings/skills/SkillsSettingsTab";
import { SkillEditor } from "../settings/skills/SkillEditor";
import { DashboardPage } from "../dashboard";
import { LogsPage } from "../logs";
import { TerminalPage } from "../terminal";
import { FilesPage } from "../files";
import { scheduleWarmHubSkillsCache } from "../../services/warm-hub-skills-cache";
import { useAppOpenedEvent } from "@analytics";
import { UpdateBanner } from "../updates/UpdateBanner";
import { LlamacppDownloadBanner } from "../updates/LlamacppDownloadBanner";
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

function OtherTabRoute() {
  const [error, setError] = React.useState<string | null>(null);
  return (
    <>
      {error && (
        <div style={{ color: "#ff6b6b", fontSize: 13, padding: "8px 0" }}>{error}</div>
      )}
      <OtherTab onError={setError} />
    </>
  );
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

  return (
    <>
      <div className={a.TopRightBannerStack}>
        <LlamacppDownloadBanner />
      </div>
      {session?.trim() ? <ChatPage /> : <StartChatPage />}
    </>
  );
}

function SidebarLayout() {
  useAppOpenedEvent();
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

export function FullscreenTopbar(props: {
  title: string;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className={a.UiTopbar}>
      <div className={a.UiTopbarLeft}>
        <Brand />
        <span className={a.UiTopbarTitle}>{props.title}</span>
      </div>
      <div className={a.UiTopbarActions}>
        {props.children}
        <button
          type="button"
          className={a.UiTopbarBackButton}
          onClick={() => void navigate(-1)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M12.25 7H1.75M1.75 7L6.125 2.625M1.75 7L6.125 11.375" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Back</span>
        </button>
      </div>
    </div>
  );
}

export function FullscreenShell(props: { children: React.ReactNode }) {
  return (
    <div className={a.UiAppShell}>
      {props.children}
    </div>
  );
}

export function App() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.gateway.state);
  const onboardingLoaded = useAppSelector((s) => s.onboarding.loaded);
  const onboarded = useAppSelector((s) => s.onboarding.onboarded);
  const navigate = useNavigate();
  const didAutoNavRef = React.useRef(false);
  const wasRestartingRef = React.useRef(false);

  React.useEffect(() => {
    void dispatch(initGatewayState());
    void dispatch(loadOnboardingState());
  }, [dispatch]);

  React.useEffect(() => {
    if (state?.kind === "ready") {
      scheduleWarmHubSkillsCache(state.port);
    }
  }, [state]);

  React.useEffect(() => {
    if (!state) return;

    if (state.kind === "ready") {
      if (!onboardingLoaded) return;
      if (didAutoNavRef.current) {
        if (wasRestartingRef.current) {
          wasRestartingRef.current = false;
          void navigate(routes.settingsMessengers, { replace: true });
        }
        return;
      }
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
    if (state.kind === "restarting") {
      wasRestartingRef.current = true;
      void navigate(routes.loading, { replace: true });
    }
  }, [state, navigate, onboardingLoaded, onboarded]);

  if (state?.kind === "ready") {
    return (
      <>
      <UpdateBanner />
      <Routes>
        <Route path="setup/*" element={<SetupPage />} />
        <Route path="/" element={<SidebarLayout />}>
          <Route index element={<Navigate to={routes.chat} replace />} />
          <Route path="chat" element={<ChatRoute />} />
          <Route path="terminal" element={<TerminalPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="skills" element={<Navigate to={routes.settingsSkills} replace />} />
          <Route path="skills/edit/:name" element={<SkillEditor />} />
          <Route path="settings" element={<SettingsPage state={state} />}>
            <Route index element={<SettingsIndexRedirect />} />
            <Route path="ai-providers" element={<Navigate to={routes.settingsModels} replace />} />
            <Route path="ai-models" element={<AiModelsTab />} />
            <Route path="local-models" element={<Navigate to={routes.settingsModels} replace />} />
            <Route path="skills" element={<SkillsSettingsTab />} />
            <Route path="messengers" element={<ConnectorsTab />} />
            <Route
              path="voice"
              element={
                <PlaceholderTab
                  title="Voice"
                  description="Speech and transcription controls are reserved for a future Hermes desktop update."
                />
              }
            />
            <Route path="mcp-servers" element={<McpServersTab />} />
            <Route
              path="account"
              element={
                <PlaceholderTab
                  title="Account"
                  description="Account-level desktop controls are planned but are not available in Hermes yet."
                />
              }
            />
            <Route path="other" element={<OtherTabRoute />} />
          </Route>
        </Route>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="*" element={<Navigate to={routes.chat} replace />} />
      </Routes>
      </>
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
