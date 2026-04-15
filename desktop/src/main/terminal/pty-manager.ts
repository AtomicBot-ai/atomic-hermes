import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as pty from "node-pty";
import type { BrowserWindow } from "electron";
import { app } from "electron";

type PtyInstance = pty.IPty;

interface TerminalSession {
  pty: PtyInstance;
  /** Circular buffer of recent output for replay on reconnect. */
  buffer: string;
  alive: boolean;
}

/** Cap per-terminal buffer at 100 KB to avoid unbounded memory growth. */
const MAX_BUFFER_SIZE = 100 * 1024;

const terminals = new Map<string, TerminalSession>();

// ─── Resource path helpers (mirrors python-bridge.ts logic) ──────────────

function getResourcePath(...segments: string[]): string {
  const base = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "..", "..", "build");
  return path.join(base, ...segments);
}

// ─── Python resolution ──────────────────────────────────────────────────

/**
 * Find the best available Python for the terminal wrapper.
 * In packaged mode: bundled venv python.
 * In dev mode: repo venv > system python3. The bundled venv has
 * relocatable patches that break when invoked outside the .app bundle.
 */
function resolvePython(): { python: string; hermesAgent: string } {
  if (app.isPackaged) {
    return {
      python: path.join(getResourcePath("hermes-venv"), "bin", "python3"),
      hermesAgent: getResourcePath("hermes-agent"),
    };
  }

  // Dev mode: repo root is 4 levels up from dist/main/terminal/
  const repoRoot = path.join(__dirname, "..", "..", "..", "..");

  // Check repo venv or .venv
  for (const venvDir of ["venv", ".venv"]) {
    const candidate = path.join(repoRoot, venvDir, "bin", "python3");
    if (fs.existsSync(candidate)) {
      return { python: candidate, hermesAgent: repoRoot };
    }
  }

  // Fall back to system python3 (pyenv, homebrew, etc.)
  return { python: "python3", hermesAgent: repoRoot };
}

// ─── Hermes CLI wrapper ─────────────────────────────────────────────────

/**
 * Ensure a helper bin directory exists with a `hermes` wrapper script
 * so users can type `hermes` directly in the embedded terminal.
 *
 * In packaged mode a wrapper is always written.
 * In dev mode a wrapper is written only when there's no venv with a
 * native `hermes` entry-point (installed via pip/uv).
 */
function ensureTerminalBinDir(stateDir: string): string {
  const binDir = path.join(stateDir, ".terminal-bin");
  try {
    fs.mkdirSync(binDir, { recursive: true });
  } catch {
    // ignore
  }

  const { python, hermesAgent } = resolvePython();

  const wrapperPath = path.join(binDir, "hermes");
  const script = [
    "#!/bin/sh",
    `export PYTHONPATH="${hermesAgent}:$PYTHONPATH"`,
    `exec "${python}" -c "from hermes_cli.main import main; main()" "$@"`,
    "",
  ].join("\n");

  fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
  return binDir;
}

/**
 * In dev mode, find the repo's virtualenv directory (.venv or venv)
 * that contains installed hermes + all dependencies.
 */
function findRepoVenvBin(): string | null {
  if (app.isPackaged) return null;
  const repoRoot = path.join(__dirname, "..", "..", "..", "..");
  for (const dir of [".venv", "venv"]) {
    const bin = path.join(repoRoot, dir, "bin");
    if (fs.existsSync(path.join(bin, "python3"))) {
      return bin;
    }
  }
  return null;
}

// ─── PATH construction ──────────────────────────────────────────────────

/**
 * Build a PATH string that includes all bundled binaries so the user can run
 * hermes, node, rg, ffmpeg, python etc. directly from the embedded terminal.
 */
function buildTerminalPath(terminalBinDir: string): string {
  const systemPath = process.env.PATH ?? "";
  const extraDirs: string[] = [];

  // In dev mode, the repo venv has the real hermes entry-point and all deps.
  // Place it first so `hermes`, `python3`, etc. resolve to the repo venv.
  const repoVenvBin = findRepoVenvBin();
  if (repoVenvBin) {
    extraDirs.push(repoVenvBin);
  }

  // Wrapper bin (fallback for packaged mode or when no repo venv)
  extraDirs.push(terminalBinDir);

  // Bundled binaries (rg, node, ffmpeg)
  const binDir = getResourcePath("bin");
  if (fs.existsSync(binDir)) {
    extraDirs.push(binDir);
  }

  // Node modules .bin
  const nodeModulesBin = getResourcePath("node_modules", ".bin");
  if (fs.existsSync(nodeModulesBin)) {
    extraDirs.push(nodeModulesBin);
  }

  // Bundled venv/python are only usable in packaged mode;
  // in dev mode they have relocatable patches that break.
  if (app.isPackaged) {
    const venvBin = path.join(getResourcePath("hermes-venv"), "bin");
    if (fs.existsSync(venvBin)) {
      extraDirs.push(venvBin);
    }

    const pythonBin = path.join(getResourcePath("python"), "bin");
    if (fs.existsSync(pythonBin)) {
      extraDirs.push(pythonBin);
    }
  }

  const unique = Array.from(new Set(extraDirs.filter(Boolean)));
  if (unique.length === 0) {
    return systemPath;
  }
  return `${unique.join(path.delimiter)}${path.delimiter}${systemPath}`;
}

// ─── Public API ─────────────────────────────────────────────────────────

export type CreateTerminalParams = {
  getMainWindow: () => BrowserWindow | null;
  stateDir: string;
};

export function createTerminal(params: CreateTerminalParams): { id: string } {
  const id = crypto.randomBytes(8).toString("hex");

  const shell = process.env.SHELL || "/bin/sh";
  const cwd = params.stateDir;

  const terminalBinDir = ensureTerminalBinDir(params.stateDir);
  const mergedPath = buildTerminalPath(terminalBinDir);

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) {
      env[k] = v;
    }
  }

  // Remove any existing PATH-like key (case-insensitive for Windows compat)
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === "PATH") {
      delete env[key];
    }
  }
  env.PATH = mergedPath;

  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  env.TERM = env.TERM || "xterm-256color";

  // Ensure hermes home is set for any hermes CLI invocations
  env.HERMES_HOME = path.join(params.stateDir);

  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env,
  });

  const session: TerminalSession = { pty: ptyProcess, buffer: "", alive: true };
  terminals.set(id, session);

  ptyProcess.onData((data: string) => {
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER_SIZE) {
      session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER_SIZE);
    }

    const win = params.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("terminal:data", { id, data });
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    session.alive = false;
    const win = params.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("terminal:exit", { id, exitCode, signal });
    }
  });

  return { id };
}

export function writeTerminal(id: string, data: string): void {
  const session = terminals.get(id);
  if (session?.alive) {
    session.pty.write(data);
  }
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const session = terminals.get(id);
  if (session?.alive) {
    session.pty.resize(Math.max(cols, 1), Math.max(rows, 1));
  }
}

export function killTerminal(id: string): void {
  const session = terminals.get(id);
  if (!session) {
    return;
  }
  try {
    session.pty.kill();
  } catch {
    // ignore
  }
  terminals.delete(id);
}

export function listTerminals(): Array<{ id: string; alive: boolean }> {
  const result: Array<{ id: string; alive: boolean }> = [];
  for (const [id, session] of terminals) {
    result.push({ id, alive: session.alive });
  }
  return result;
}

export function getTerminalBuffer(id: string): string {
  return terminals.get(id)?.buffer ?? "";
}

export function killAllTerminals(): void {
  for (const [id] of terminals) {
    killTerminal(id);
  }
}
