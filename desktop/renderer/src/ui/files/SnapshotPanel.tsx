import React from "react";
import s from "./FilesPage.module.css";

export type SnapshotEntry = {
  snapshotPath: string;
  timestamp: number;
  size: number;
  label: string;
};

type SnapshotsApi = {
  filesListSnapshots: (path: string) => Promise<SnapshotEntry[]>;
  filesDeleteSnapshot: (snapshotPath: string) => Promise<{ ok: boolean }>;
  filesRestoreSnapshot: (path: string, snapshotPath: string) => Promise<{ ok: boolean }>;
};

function getApi(): SnapshotsApi | null {
  return (window as any).hermesAPI as SnapshotsApi | null;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IconHistory() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRestore() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M2 2v5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 7A6 6 0 1 1 3 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1M6 7v4M10 7v4M4.5 4l.5 9a1 1 0 001 1h4a1 1 0 001-1l.5-9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type SnapshotPanelProps = {
  selectedPath: string | null;
  onCompare: (snapshot: SnapshotEntry) => void;
  activeSnapshotPath: string | null;
  onRefreshFile: () => void;
};

export function SnapshotPanel({ selectedPath, onCompare, activeSnapshotPath, onRefreshFile }: SnapshotPanelProps) {
  const [snapshots, setSnapshots] = React.useState<SnapshotEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  const loadSnapshots = React.useCallback(async () => {
    const api = getApi();
    if (!api || !selectedPath) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    try {
      const result = await api.filesListSnapshots(selectedPath);
      setSnapshots(result);
    } catch (err) {
      console.error("Failed to list snapshots:", err);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPath]);

  React.useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const handleDelete = React.useCallback(async (e: React.MouseEvent, snap: SnapshotEntry) => {
    e.stopPropagation();
    const api = getApi();
    if (!api) return;
    try {
      await api.filesDeleteSnapshot(snap.snapshotPath);
      void loadSnapshots();
    } catch (err) {
      console.error("Failed to delete snapshot:", err);
    }
  }, [loadSnapshots]);

  const handleRestore = React.useCallback(async (e: React.MouseEvent, snap: SnapshotEntry) => {
    e.stopPropagation();
    const api = getApi();
    if (!api || !selectedPath) return;
    try {
      await api.filesRestoreSnapshot(selectedPath, snap.snapshotPath);
      onRefreshFile();
      void loadSnapshots();
    } catch (err) {
      console.error("Failed to restore snapshot:", err);
    }
  }, [selectedPath, loadSnapshots, onRefreshFile]);

  if (!selectedPath) {
    return (
      <div className={s.SnapshotPanel}>
        <div className={s.SnapshotHeader}>
          <span className={s.SnapshotTitle}>HISTORY</span>
        </div>
        <div className={s.SnapshotEmpty}>
          <IconHistory />
          <span>Select a file to view history</span>
        </div>
      </div>
    );
  }

  return (
    <div className={s.SnapshotPanel}>
      <div className={s.SnapshotHeader}>
        <span className={s.SnapshotTitle}>HISTORY</span>
        <button type="button" className={s.SnapshotRefreshBtn} onClick={() => void loadSnapshots()} title="Refresh">
          ↻
        </button>
      </div>
      <div className={s.SnapshotList}>
        {loading ? (
          <div className={s.SnapshotEmpty}>Loading...</div>
        ) : snapshots.length === 0 ? (
          <div className={s.SnapshotEmpty}>
            <IconHistory />
            <span>No history for this file</span>
          </div>
        ) : (
          snapshots.map((snap) => {
            const isActive = activeSnapshotPath === snap.snapshotPath;
            return (
              <div
                key={snap.snapshotPath}
                className={`${s.SnapshotItem} ${isActive ? s.SnapshotItemActive : ""}`}
                onClick={() => onCompare(snap)}
                role="button"
                tabIndex={0}
              >
                <div className={s.SnapshotItemMain}>
                  <span className={s.SnapshotTime}>{formatRelativeTime(snap.timestamp)}</span>
                  <span className={s.SnapshotSize}>{formatSize(snap.size)}</span>
                </div>
                <div className={s.SnapshotActions}>
                  <button
                    type="button"
                    className={s.SnapshotActionBtn}
                    onClick={(e) => void handleRestore(e, snap)}
                    title="Restore this version"
                  >
                    <IconRestore />
                  </button>
                  <button
                    type="button"
                    className={s.SnapshotActionBtn}
                    onClick={(e) => void handleDelete(e, snap)}
                    title="Delete snapshot"
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
