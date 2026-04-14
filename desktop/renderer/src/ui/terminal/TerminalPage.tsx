import React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import s from "./TerminalPage.module.css";

// ─── Types ──────────────────────────────────────────────────────────────

interface TabInfo {
  id: string;
  label: string;
  alive: boolean;
}

// ─── Shared xterm theme ─────────────────────────────────────────────────

const XTERM_THEME = {
  background: "#171717",
  foreground: "#e6edf3",
  cursor: "#ff7a00",
  cursorAccent: "#171717",
  selectionBackground: "rgba(255, 122, 0, 0.3)",
  black: "#1e1e1e",
  red: "#f44747",
  green: "#6a9955",
  yellow: "#d7ba7d",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#e6edf3",
  brightBlack: "#808080",
  brightRed: "#f44747",
  brightGreen: "#6a9955",
  brightYellow: "#d7ba7d",
  brightBlue: "#569cd6",
  brightMagenta: "#c586c0",
  brightCyan: "#4ec9b0",
  brightWhite: "#ffffff",
} as const;

// ─── Preload API accessor ───────────────────────────────────────────────

function getApi() {
  return (window as any).hermesAPI as {
    terminalCreate: () => Promise<{ id: string }>;
    terminalWrite: (id: string, data: string) => Promise<void>;
    terminalResize: (id: string, cols: number, rows: number) => Promise<void>;
    terminalKill: (id: string) => Promise<void>;
    terminalList: () => Promise<Array<{ id: string; alive: boolean }>>;
    terminalGetBuffer: (id: string) => Promise<string>;
    onTerminalData: (cb: (p: { id: string; data: string }) => void) => () => void;
    onTerminalExit: (cb: (p: { id: string; exitCode: number; signal?: number }) => void) => () => void;
  } | null;
}

// ─── Single terminal pane (xterm instance) ──────────────────────────────

function TerminalPane({ terminalId, visible }: { terminalId: string; visible: boolean }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const termRef = React.useRef<Terminal | null>(null);
  const fitAddonRef = React.useRef<FitAddon | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    const api = getApi();
    if (!el || !api) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      theme: XTERM_THEME,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    void api.terminalGetBuffer(terminalId).then((buf) => {
      if (buf) {
        term.write(buf);
      }
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          void api.terminalResize(terminalId, term.cols, term.rows);
        } catch {
          // ignore
        }
      });
    });

    const onDataDisposable = term.onData((data) => {
      void api.terminalWrite(terminalId, data);
    });

    const unsubData = api.onTerminalData((p) => {
      if (p.id === terminalId) {
        term.write(p.data);
      }
    });

    const unsubExit = api.onTerminalExit((p) => {
      if (p.id === terminalId) {
        term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        void api.terminalResize(terminalId, term.cols, term.rows);
      } catch {
        // ignore
      }
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      unsubData();
      unsubExit();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId]);

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    requestAnimationFrame(() => {
      const api = getApi();
      const fitAddon = fitAddonRef.current;
      const term = termRef.current;
      if (fitAddon && term) {
        try {
          fitAddon.fit();
          void api?.terminalResize(terminalId, term.cols, term.rows);
        } catch {
          // ignore
        }
      }
    });
  }, [visible, terminalId]);

  return (
    <div
      className={s.UiTerminalPane}
      ref={containerRef}
      style={{ display: visible ? "block" : "none" }}
    />
  );
}

// ─── Main terminal page with tabs ───────────────────────────────────────

export function TerminalPage() {
  const [tabs, setTabs] = React.useState<TabInfo[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const nextTabNumberRef = React.useRef(1);

  React.useEffect(() => {
    const api = getApi();
    if (!api) {
      return;
    }

    let alive = true;
    void (async () => {
      const existing = await api.terminalList();
      if (!alive) {
        return;
      }

      if (existing.length > 0) {
        const restored = existing.map((t, i) => ({
          id: t.id,
          label: `Terminal ${i + 1}`,
          alive: t.alive,
        }));
        nextTabNumberRef.current = existing.length + 1;
        setTabs(restored);
        setActiveId(restored[0].id);
      } else {
        const { id } = await api.terminalCreate();
        if (!alive) {
          return;
        }
        const tab: TabInfo = { id, label: `Terminal ${nextTabNumberRef.current++}`, alive: true };
        setTabs([tab]);
        setActiveId(id);
      }

      setReady(true);
    })();

    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    const api = getApi();
    if (!api) {
      return;
    }
    const unsub = api.onTerminalExit((p) => {
      setTabs((prev) => prev.map((t) => (t.id === p.id ? { ...t, alive: false } : t)));
    });
    return unsub;
  }, []);

  const handleNewTab = React.useCallback(async () => {
    const api = getApi();
    if (!api) {
      return;
    }
    const { id } = await api.terminalCreate();
    const tab: TabInfo = { id, label: `Terminal ${nextTabNumberRef.current++}`, alive: true };
    setTabs((prev) => [...prev, tab]);
    setActiveId(id);
  }, []);

  const handleCloseTab = React.useCallback(
    (closedId: string) => {
      const api = getApi();
      if (api) {
        void api.terminalKill(closedId);
      }
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== closedId);
        if (activeId === closedId) {
          const closedIdx = prev.findIndex((t) => t.id === closedId);
          const newActive = next[Math.min(closedIdx, next.length - 1)]?.id ?? null;
          queueMicrotask(() => setActiveId(newActive));
        }
        return next;
      });
    },
    [activeId],
  );

  if (!ready) {
    return (
      <div className={s.UiTerminalPage}>
        <div className={s.UiTerminalLoading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={s.UiTerminalPage}>
      {/* Tab bar */}
      <div className={s.UiTerminalTabBar}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`${s.UiTerminalTab} ${tab.id === activeId ? s.UiTerminalTabActive : ""} ${!tab.alive ? s.UiTerminalTabDead : ""}`}
            onClick={() => setActiveId(tab.id)}
            role="tab"
            aria-selected={tab.id === activeId}
          >
            <span className={s.UiTerminalTabLabel}>{tab.label}</span>
            <button
              type="button"
              className={s.UiTerminalTabClose}
              onClick={(e) => {
                e.stopPropagation();
                handleCloseTab(tab.id);
              }}
              aria-label={`Close ${tab.label}`}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className={s.UiTerminalNewTab}
          onClick={handleNewTab}
          aria-label="New terminal"
        >
          +
        </button>
      </div>

      {/* Terminal panes — all mounted, only the active one is visible */}
      <div className={s.UiTerminalPaneContainer}>
        {tabs.map((tab) => (
          <TerminalPane key={tab.id} terminalId={tab.id} visible={tab.id === activeId} />
        ))}
        {tabs.length === 0 && (
          <div className={s.UiTerminalEmpty}>
            No terminals. Click <strong>+</strong> to open one.
          </div>
        )}
      </div>
    </div>
  );
}
