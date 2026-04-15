import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { app } from "electron";

/**
 * Resolves paths to bundled resources inside the .app bundle
 * (Contents/Resources/) in production, or the build/ dir in dev.
 */
function getResourcePath(...segments: string[]): string {
  const inAsar = app.isPackaged;
  const base = inAsar
    ? process.resourcesPath
    : path.join(__dirname, "..", "..", "build");
  return path.join(base, ...segments);
}

function getHermesHome(): string {
  return path.join(app.getPath("userData"), "hermes");
}

function ensureHermesHome(): void {
  const home = getHermesHome();
  const dirs = ["memory", "sessions", "skills", "skins"];
  for (const d of dirs) {
    fs.mkdirSync(path.join(home, d), { recursive: true });
  }
}

function syncSkills(): void {
  const bundledSkills = getResourcePath("skills");
  if (!fs.existsSync(bundledSkills)) return;

  const targetSkills = path.join(getHermesHome(), "skills");
  fs.mkdirSync(targetSkills, { recursive: true });

  copyDirRecursive(bundledSkills, targetSkills);
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (stat.isFile() && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Build the PATH that the Python process will inherit, placing all
 * bundled binaries first so hermes tools find rg, node, ffmpeg.
 */
function buildPath(): string {
  const parts: string[] = [];

  const binDir = getResourcePath("bin");
  if (fs.existsSync(binDir)) parts.push(binDir);

  const nodeDir = getResourcePath("node_modules", ".bin");
  if (fs.existsSync(nodeDir)) parts.push(nodeDir);

  const pythonBin = path.dirname(getPythonPath());
  parts.push(pythonBin);

  const venvBin = path.join(getResourcePath("hermes-venv"), "bin");
  if (fs.existsSync(venvBin)) parts.push(venvBin);

  if (process.env.PATH) parts.push(process.env.PATH);
  return parts.join(":");
}

function getPythonPath(): string {
  const venvPython = path.join(getResourcePath("hermes-venv"), "bin", "python3");
  if (fs.existsSync(venvPython)) return venvPython;

  const standalonePython = path.join(getResourcePath("python"), "bin", "python3");
  if (fs.existsSync(standalonePython)) return standalonePython;

  return "python3";
}

/**
 * Patch pyvenv.cfg with the correct absolute `home` path at runtime.
 * bundle-all.sh writes a relative path (../python/bin) for codesign compatibility,
 * but CPython requires an absolute path to properly detect the venv and add
 * its site-packages to sys.path.
 */
function patchPyvenvCfg(): void {
  const venvDir = getResourcePath("hermes-venv");
  const cfgPath = path.join(venvDir, "pyvenv.cfg");
  if (!fs.existsSync(cfgPath)) return;

  const pythonBinDir = getResourcePath("python", "bin");
  if (!fs.existsSync(pythonBinDir)) return;

  try {
    const content = fs.readFileSync(cfgPath, "utf-8");
    const patched = content.replace(
      /^home\s*=\s*.*/m,
      `home = ${pythonBinDir}`,
    );
    if (patched !== content) {
      fs.writeFileSync(cfgPath, patched, "utf-8");
    }
  } catch {
    // Non-fatal: venv might still work via VIRTUAL_ENV env var
  }
}

export const RESTART_EXIT_CODE = 75;

export interface PythonBridge {
  process: ChildProcess;
  port: number;
  /** Resolves with the dashboard port once the dashboard server is up. */
  dashboardPort: Promise<number>;
  kill: () => void;
  /** Register a callback that fires when the process exits with the restart code. */
  onRestartExit: (cb: () => void) => void;
}

function getServerScript(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "python-server", "desktop-gateway.py")
    : path.join(__dirname, "..", "..", "src", "python-server", "desktop-gateway.py");
}

function createBridge(
  child: ChildProcess,
  port: number,
  dashboardPort: Promise<number>,
): PythonBridge {
  let restartCb: (() => void) | null = null;

  child.on("exit", (code) => {
    if (code === RESTART_EXIT_CODE && restartCb) {
      restartCb();
    }
  });

  return {
    process: child,
    port,
    dashboardPort,
    kill: () => {
      restartCb = null;
      if (!child.killed) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5_000);
      }
    },
    onRestartExit: (cb) => { restartCb = cb; },
  };
}

export async function startPythonBackend(): Promise<PythonBridge> {
  ensureHermesHome();
  syncSkills();
  patchPyvenvCfg();

  const pythonPath = getPythonPath();
  const serverScript = getServerScript();

  const hermesRoot = getResourcePath("hermes-agent");
  const hermesHome = getHermesHome();
  const venvDir = getResourcePath("hermes-venv");

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PATH: buildPath(),
    HERMES_HOME: hermesHome,
    HERMES_AGENT_ROOT: hermesRoot,
    PYTHONDONTWRITEBYTECODE: "1",
    NODE_PATH: getResourcePath("node_modules"),
    HERMES_DESKTOP_MODE: "1",
    VIRTUAL_ENV: venvDir,
  };

  const child = spawn(pythonPath, [serverScript], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    cwd: hermesRoot,
  });

  let dashboardResolve: ((port: number) => void) | null = null;
  let dashboardReject: ((err: Error) => void) | null = null;
  const dashboardPort = new Promise<number>((resolve, reject) => {
    dashboardResolve = resolve;
    dashboardReject = reject;
  });

  const gatewayPort = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Gateway did not start within 60s"));
    }, 60_000);

    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();

      const gwMatch = text.match(/HERMES_PORT:(\d+)/);
      if (gwMatch) {
        clearTimeout(timeout);
        resolve(parseInt(gwMatch[1], 10));
      }

      const dbMatch = text.match(/HERMES_DASHBOARD_PORT:(\d+)/);
      if (dbMatch) {
        dashboardResolve?.(parseInt(dbMatch[1], 10));
        dashboardResolve = null;
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      if (stderr.length > 8192) stderr = stderr.slice(-4096);
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn Python: ${err.message}`));
      dashboardReject?.(new Error("Process failed to start"));
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Python exited with code ${code}.\nStderr: ${stderr.slice(-2048)}`
        )
      );
      dashboardReject?.(new Error(`Python exited with code ${code}`));
    });
  });

  return createBridge(child, gatewayPort, dashboardPort);
}
