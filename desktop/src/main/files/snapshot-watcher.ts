import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import chokidar from "chokidar";
import { saveSnapshot, purgeSnapshots, type PurgeConfig } from "./snapshot-operations";

const HISTORY_DIR = ".history";
const MAX_WATCH_SIZE = 5 * 1024 * 1024;
const DEBOUNCE_MS = 500;

const IGNORED_PATTERNS = [
  /[/\\]\.history[/\\]/,
  /\.tmp\.\d+$/,
  /[/\\]\.git[/\\]/,
  /[/\\]node_modules[/\\]/,
  /[/\\]__pycache__[/\\]/,
];

function shouldIgnore(filePath: string): boolean {
  return IGNORED_PATTERNS.some((p) => p.test(filePath));
}

function hashContent(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

export class SnapshotWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private contentCache = new Map<string, { hash: string; content: string }>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private purgeConfig: PurgeConfig;
  private root: string;

  constructor(root: string, purgeConfig?: PurgeConfig) {
    this.root = root;
    this.purgeConfig = purgeConfig ?? { maxCount: 50, maxAgeDays: 0 };
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.root, {
      persistent: true,
      ignoreInitial: false,
      ignored: (filePath: string) => {
        const rel = path.relative(this.root, filePath);
        if (rel.startsWith(HISTORY_DIR + path.sep) || rel === HISTORY_DIR) return true;
        return shouldIgnore(filePath);
      },
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    this.watcher.on("add", (filePath) => this.handleFileEvent(filePath, "add"));
    this.watcher.on("change", (filePath) => this.handleFileEvent(filePath, "change"));
  }

  stop(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.contentCache.clear();
  }

  private handleFileEvent(filePath: string, event: "add" | "change"): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.processFileChange(filePath, event);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(filePath, timer);
  }

  private processFileChange(filePath: string, event: "add" | "change"): void {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return;
      if (stat.size > MAX_WATCH_SIZE || stat.size === 0) return;
    } catch {
      return;
    }

    let newContent: string;
    try {
      newContent = fs.readFileSync(filePath, "utf-8");
    } catch {
      return;
    }

    const newHash = hashContent(newContent);
    const cached = this.contentCache.get(filePath);

    if (event === "add") {
      this.contentCache.set(filePath, { hash: newHash, content: newContent });
      return;
    }

    if (cached && cached.hash !== newHash) {
      const relativePath = path.relative(this.root, filePath);
      try {
        saveSnapshot(this.root, relativePath, cached.content);
        purgeSnapshots(this.root, relativePath, this.purgeConfig);
      } catch (err) {
        console.error("[snapshot-watcher] Failed to save snapshot:", err);
      }
    }

    this.contentCache.set(filePath, { hash: newHash, content: newContent });
  }
}
