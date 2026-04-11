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
  return path.join(
    app.getPath("appData"),
    "ai.atomicbot.hermes"
  );
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

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
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

export interface PythonBridge {
  process: ChildProcess;
  port: number;
  kill: () => void;
}

export async function startPythonBackend(): Promise<PythonBridge> {
  ensureHermesHome();
  syncSkills();

  const pythonPath = getPythonPath();
  const serverScript = app.isPackaged
    ? path.join(process.resourcesPath, "python-server", "server.py")
    : path.join(__dirname, "..", "..", "src", "python-server", "server.py");

  const hermesRoot = getResourcePath("hermes-agent");
  const hermesHome = getHermesHome();

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PATH: buildPath(),
    HERMES_HOME: hermesHome,
    HERMES_AGENT_ROOT: hermesRoot,
    PYTHONDONTWRITEBYTECODE: "1",
    NODE_PATH: getResourcePath("node_modules"),
  };

  const child = spawn(pythonPath, [serverScript], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    cwd: hermesRoot,
  });

  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Python backend did not start within 30s"));
    }, 30_000);

    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      const match = text.match(/HERMES_PORT:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(parseInt(match[1], 10));
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 8192) stderr = stderr.slice(-4096);
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Python exited with code ${code}.\nStderr: ${stderr.slice(-2048)}`
        )
      );
    });
  });

  return {
    process: child,
    port,
    kill: () => {
      if (!child.killed) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5_000);
      }
    },
  };
}
