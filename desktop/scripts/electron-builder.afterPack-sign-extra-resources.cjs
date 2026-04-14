/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf-8", ...opts });
  if (res.status !== 0) {
    const stderr = String(res.stderr || "").trim();
    const stdout = String(res.stdout || "").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed: ${stderr || stdout || `exit ${res.status}`}`);
  }
  return String(res.stdout || "");
}

function listDirSafe(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true });
  } catch {
    return [];
  }
}

function findFirstAppBundle(appOutDir) {
  for (const entry of listDirSafe(appOutDir)) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return path.join(appOutDir, entry.name);
    }
  }
  return null;
}

function selectSigningIdentity() {
  const explicit =
    (process.env.CSC_NAME && String(process.env.CSC_NAME).trim()) ||
    (process.env.SIGN_IDENTITY && String(process.env.SIGN_IDENTITY).trim()) ||
    (process.env.CODESIGN_IDENTITY && String(process.env.CODESIGN_IDENTITY).trim());
  if (explicit) {
    return explicit;
  }

  const out = run("security", ["find-identity", "-p", "codesigning", "-v"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const pickFirst = (re) => {
    for (const line of lines) {
      const m = line.match(re);
      if (m && m[1]) {
        return m[1];
      }
    }
    return null;
  };

  return (
    pickFirst(/"([^"]*Developer ID Application[^"]*)"/) ||
    pickFirst(/"([^"]*Apple Distribution[^"]*)"/) ||
    pickFirst(/"([^"]*Apple Development[^"]*)"/) ||
    pickFirst(/"([^"]+)"/)
  );
}

function shouldTimestamp(identity) {
  if (!identity || identity === "-") {
    return false;
  }
  return identity.includes("Developer ID Application");
}

function isMachoBinary(filePath) {
  const out = run("/usr/bin/file", ["-b", filePath], { stdio: ["ignore", "pipe", "pipe"] });
  return out.includes("Mach-O");
}

function shouldConsiderForSigning(filePath, st) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".dylib" || ext === ".node" || ext === ".so") {
    return true;
  }
  if ((st.mode & 0o111) !== 0) {
    return true;
  }
  return false;
}

function walkFiles(rootDir, onFile) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      onFile(full);
    }
  }
}

function findEntitlementsInherit() {
  const appRoot = path.resolve(__dirname, "..");
  const entPath = path.join(appRoot, "entitlements.mac.inherit.plist");
  if (fs.existsSync(entPath)) {
    return entPath;
  }
  return null;
}

function codesignFile(filePath, identity, entitlements) {
  const args = ["--force", "--sign", identity];

  if (identity !== "-") {
    args.push("--options", "runtime");
  }

  if (entitlements) {
    args.push("--entitlements", entitlements);
  }

  if (shouldTimestamp(identity)) {
    args.push("--timestamp");
  } else {
    args.push("--timestamp=none");
  }

  args.push(filePath);

  run("/usr/bin/codesign", args, { stdio: "inherit" });
}

function removeBrokenSymlinks(rootDir) {
  let removed = 0;
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          fs.statSync(full);
        } catch {
          fs.unlinkSync(full);
          removed += 1;
        }
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(full);
      }
    }
  }
  return removed;
}

function renameFakeAppBundles(rootDir) {
  let renamed = 0;
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name.endsWith(".app")) {
        const infoPlist = path.join(full, "Contents", "Info.plist");
        if (!fs.existsSync(infoPlist)) {
          const newName = full.replace(/\.app$/, ".app-dir");
          fs.renameSync(full, newName);
          renamed += 1;
          continue;
        }
      }
      stack.push(full);
    }
  }
  return renamed;
}

/**
 * electron-builder afterPack hook.
 *
 * 1. Removes broken symlinks and fake .app bundles that cause codesign --verify to fail.
 * 2. Signs extraResources Mach-O binaries (Python, ripgrep, Node, native addons)
 *    BEFORE electron-builder applies the final app bundle signature on macOS.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  console.log("[hermes-desktop] afterPack v4: starting bundle cleanup...");

  const appOutDir = context.appOutDir;
  const appBundle = findFirstAppBundle(appOutDir);
  if (!appBundle) {
    throw new Error(`[hermes-desktop] Failed to locate .app bundle in: ${appOutDir}`);
  }

  console.log(`[hermes-desktop] afterPack: cleaning bundle at ${appBundle}`);

  // Enumerate ALL symlinks in the bundle for diagnostics.
  // codesign --verify rejects: broken targets, absolute paths outside bundle, cycles.
  try {
    const allLinksResult = spawnSync("find", [appBundle, "-type", "l"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
    const allLinks = (allLinksResult.stdout || "").trim().split("\n").filter(Boolean);
    console.log(`[hermes-desktop] afterPack: total symlinks in bundle: ${allLinks.length}`);

    let broken = 0;
    let absolute = 0;
    let outsideBundle = 0;

    for (const link of allLinks) {
      let target;
      try {
        target = fs.readlinkSync(link);
      } catch {
        continue;
      }

      const isAbsolute = path.isAbsolute(target);
      let targetExists = false;
      try {
        fs.statSync(link);
        targetExists = true;
      } catch {
        targetExists = false;
      }

      // Resolve the actual destination
      let resolvedTarget;
      try {
        resolvedTarget = isAbsolute ? target : path.resolve(path.dirname(link), target);
      } catch {
        resolvedTarget = target;
      }
      const isOutsideBundle = !resolvedTarget.startsWith(appBundle);

      if (!targetExists) {
        broken += 1;
        console.log(`  BROKEN: ${link} -> ${target}`);
        try { fs.unlinkSync(link); } catch { /* already gone */ }
      } else if (isAbsolute && isOutsideBundle) {
        outsideBundle += 1;
        console.log(`  OUTSIDE-BUNDLE: ${link} -> ${target}`);
        try { fs.unlinkSync(link); } catch { /* already gone */ }
      } else if (isAbsolute) {
        absolute += 1;
        // Convert absolute in-bundle symlink to relative
        const relTarget = path.relative(path.dirname(link), resolvedTarget);
        console.log(`  ABS->REL: ${link}: ${target} -> ${relTarget}`);
        try {
          fs.unlinkSync(link);
          fs.symlinkSync(relTarget, link);
        } catch (e) {
          console.log(`    failed to convert: ${e.message}`);
        }
      }
    }

    console.log(`[hermes-desktop] afterPack: symlink summary — broken=${broken}, absolute-in-bundle=${absolute}, outside-bundle=${outsideBundle}, ok=${allLinks.length - broken - absolute - outsideBundle}`);
  } catch (e) {
    console.log(`[hermes-desktop] afterPack: symlink scan failed (${e.message}), using Node.js walker`);
    const brokenLinks = removeBrokenSymlinks(appBundle);
    console.log(`[hermes-desktop] afterPack: removed ${brokenLinks} broken symlinks via Node.js walker`);
  }

  const resourcesDir = path.join(appBundle, "Contents", "Resources");

  // Rename fake .app directories (e.g. puppeteer chrome.app) that aren't real bundles.
  const fakeApps = renameFakeAppBundles(resourcesDir);
  console.log(`[hermes-desktop] afterPack: renamed ${fakeApps} fake .app directories`);

  // Signing extraResources
  let identity;
  try {
    identity = selectSigningIdentity();
  } catch (e) {
    console.log(`[hermes-desktop] afterPack: selectSigningIdentity error: ${e.message}`);
    identity = null;
  }

  if (!identity) {
    console.log(
      "[hermes-desktop] afterPack: no codesign identity found (skipping extraResources signing)"
    );
    return;
  }

  const candidateRoots = [
    "python",
    "hermes-venv",
    "bin",
    "node_modules",
    "skills",
    "python-server",
  ].map((name) => path.join(resourcesDir, name));
  const roots = candidateRoots.filter((p) => fs.existsSync(p));

  if (roots.length === 0) {
    console.log("[hermes-desktop] afterPack: no extraResources roots found to sign (skipping)");
    return;
  }

  const entitlements = findEntitlementsInherit();
  console.log(`[hermes-desktop] afterPack: signing extraResources with identity: ${identity}`);
  if (entitlements) {
    console.log(`[hermes-desktop] afterPack: using entitlements: ${path.basename(entitlements)}`);
  }
  let signed = 0;
  let considered = 0;

  for (const root of roots) {
    walkFiles(root, (filePath) => {
      let st;
      try {
        st = fs.statSync(filePath);
      } catch {
        return;
      }
      if (!shouldConsiderForSigning(filePath, st)) {
        return;
      }
      considered += 1;
      try {
        if (!isMachoBinary(filePath)) {
          return;
        }
      } catch {
        return;
      }
      codesignFile(filePath, identity, entitlements);
      signed += 1;
    });
  }

  console.log(
    `[hermes-desktop] afterPack: signed ${signed} Mach-O files (considered ${considered}) under: ${roots
      .map((p) => path.basename(p))
      .join(", ")}`
  );
};
