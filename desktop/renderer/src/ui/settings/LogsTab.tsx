import React from "react";
import { getLogs } from "../../services/api";
import { useSettingsState } from "./settings-context";
import { SelectDropdown, UiCheckbox } from "@shared/kit";
import { settingsStyles as s } from "./SettingsPage";
import c from "./LogsTab.module.css";

const FILE_OPTIONS = [
  { value: "agent", label: "agent.log" },
  { value: "errors", label: "errors.log" },
  { value: "gateway", label: "gateway.log" },
] as const;

const LEVEL_OPTIONS = [
  { value: "ALL", label: "All levels" },
  { value: "DEBUG", label: "Debug" },
  { value: "INFO", label: "Info" },
  { value: "WARNING", label: "Warning" },
  { value: "ERROR", label: "Error" },
] as const;

const COMPONENT_OPTIONS = [
  { value: "all", label: "All components" },
  { value: "gateway", label: "Gateway" },
  { value: "agent", label: "Agent" },
  { value: "tools", label: "Tools" },
  { value: "cli", label: "CLI" },
  { value: "cron", label: "Cron" },
] as const;

const LINE_COUNT_OPTIONS = [
  { value: "50", label: "50 lines" },
  { value: "100", label: "100 lines" },
  { value: "200", label: "200 lines" },
  { value: "500", label: "500 lines" },
] as const;

function classifyLine(line: string): "error" | "warning" | "info" | "debug" {
  const upper = line.toUpperCase();
  if (upper.includes("ERROR") || upper.includes("CRITICAL") || upper.includes("FATAL"))
    return "error";
  if (upper.includes("WARNING") || upper.includes("WARN")) return "warning";
  if (upper.includes("DEBUG")) return "debug";
  return "info";
}

const LINE_STYLE: Record<string, string> = {
  error: c.LogLineError,
  warning: c.LogLineWarning,
  info: c.LogLineInfo,
  debug: c.LogLineDebug,
};

export function LogsTab() {
  const { port } = useSettingsState();
  const [file, setFile] = React.useState("agent");
  const [level, setLevel] = React.useState("ALL");
  const [component, setComponent] = React.useState("all");
  const [lineCount, setLineCount] = React.useState("100");
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [lines, setLines] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const fetchLogs = React.useCallback(() => {
    setLoading(true);
    setError(null);
    getLogs(port, { file, lines: Number(lineCount), level, component })
      .then((resp) => {
        setLines(resp.lines);
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 50);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [port, file, lineCount, level, component]);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  return (
    <div className={s.UiSettingsPanel}>
      <div className={s.UiSettingsPanelHeader}>
        <h2 className={s.UiSettingsTabTitle}>Logs</h2>
      </div>

      <section className={s.UiSettingsSection}>
        <div className={c.Toolbar}>
          <div className={c.Filters}>
            <SelectDropdown
              value={file}
              onChange={setFile}
              options={[...FILE_OPTIONS]}
            />
            <SelectDropdown
              value={level}
              onChange={setLevel}
              options={[...LEVEL_OPTIONS]}
            />
            <SelectDropdown
              value={component}
              onChange={setComponent}
              options={[...COMPONENT_OPTIONS]}
            />
            <SelectDropdown
              value={lineCount}
              onChange={setLineCount}
              options={[...LINE_COUNT_OPTIONS]}
            />
          </div>
          <div className={c.ToolbarActions}>
            {loading && <span className={c.Spinner} />}
            <UiCheckbox
              checked={autoRefresh}
              label="Auto-refresh"
              onChange={setAutoRefresh}
            />
            {autoRefresh && (
              <span className={c.LiveBadge}>
                <span className={c.LiveDot} />
                Live
              </span>
            )}
            <button type="button" className={c.RefreshBtn} onClick={fetchLogs}>
              Refresh
            </button>
          </div>
        </div>

        {error && <div className={c.ErrorBanner}>{error}</div>}

        <div ref={scrollRef} className={c.LogViewer}>
          {lines.length === 0 && !loading && (
            <p className={c.EmptyState}>No log lines found</p>
          )}
          {lines.map((line, i) => {
            const cls = classifyLine(line);
            return (
              <div key={i} className={`${c.LogLine} ${LINE_STYLE[cls]}`}>
                {line}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
