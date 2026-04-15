import React from "react";
import { FullscreenShell, FullscreenTopbar } from "../app/App";
import appCss from "../app/App.module.css";

type DashboardState =
  | { kind: "starting" }
  | { kind: "ready"; port: number; url: string }
  | { kind: "failed"; error: string };

type HermesDesktopApi = {
  getDashboardState?: () => Promise<DashboardState>;
  openExternal?: (url: string) => Promise<{ ok: boolean }>;
  onDashboardReady?: (
    cb: (state: Extract<DashboardState, { kind: "ready" }>) => void,
  ) => void;
  onDashboardError?: (cb: (error: string) => void) => void;
};

function getDesktopApi(): HermesDesktopApi | undefined {
  return (window as { hermesAPI?: HermesDesktopApi }).hermesAPI;
}

export function DashboardPage() {
  const [state, setState] = React.useState<DashboardState>({ kind: "starting" });

  React.useEffect(() => {
    const api = getDesktopApi();
    if (!api?.getDashboardState) {
      setState({
        kind: "failed",
        error: "Desktop bridge is unavailable for dashboard startup.",
      });
      return;
    }

    let active = true;

    void api.getDashboardState()
      .then((nextState) => {
        if (active) {
          setState(nextState);
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            kind: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    api.onDashboardReady?.((nextState) => {
      if (active) {
        setState(nextState);
      }
    });

    api.onDashboardError?.((error) => {
      if (active) {
        setState({ kind: "failed", error });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (state.kind === "starting") {
    return (
      <FullscreenShell>
        <FullscreenTopbar title="Dashboard" />
        <div className={appCss.UiCentered}>
          <div className={appCss.UiCard}>
            <div className={appCss.UiCardTitle}>Starting Hermes Dashboard</div>
            <div className={appCss.UiCardSubtitle}>
              The admin interface is booting in a dedicated local process.
            </div>
          </div>
        </div>
      </FullscreenShell>
    );
  }

  if (state.kind === "failed") {
    return (
      <FullscreenShell>
        <FullscreenTopbar title="Dashboard" />
        <div className={appCss.UiCentered}>
          <div className={appCss.UiCard}>
            <div className={appCss.UiCardTitle}>Hermes Dashboard failed to start</div>
            <div className={appCss.UiCardSubtitle}>
              The embedded admin interface is unavailable, but the desktop chat backend can continue running.
            </div>
            <pre>{state.error || "No details."}</pre>
          </div>
        </div>
      </FullscreenShell>
    );
  }

  const handleOpenExternal = async () => {
    const api = getDesktopApi();
    if (!api?.openExternal) return;
    await api.openExternal(state.url);
  };

  return (
    <FullscreenShell>
      <FullscreenTopbar title="Dashboard">
        <button
          type="button"
          className={appCss.UiOpenExternalButton}
          onClick={() => void handleOpenExternal()}
        >
          Open in browser
        </button>
      </FullscreenTopbar>
      <div className={appCss.UiAppPage}>
        <div className={appCss.UiDashboardLayout}>
          <iframe className={appCss.UiDashboardIframe} title="Hermes Dashboard" src={state.url} />
        </div>
      </div>
    </FullscreenShell>
  );
}
