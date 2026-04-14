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

function findFirstAppBundle(dir) {
  for (const entry of listDirSafe(dir)) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return path.join(dir, entry.name);
    }
  }
  return null;
}

function hasNotaryAuthEnv() {
  if (process.env.NOTARYTOOL_PROFILE && String(process.env.NOTARYTOOL_PROFILE).trim()) {
    return true;
  }
  const key = process.env.NOTARYTOOL_KEY && String(process.env.NOTARYTOOL_KEY).trim();
  const keyId = process.env.NOTARYTOOL_KEY_ID && String(process.env.NOTARYTOOL_KEY_ID).trim();
  const issuer = process.env.NOTARYTOOL_ISSUER && String(process.env.NOTARYTOOL_ISSUER).trim();
  return Boolean(key && keyId && issuer);
}

function appRootFromHere() {
  return path.resolve(__dirname, "..");
}

function readDesktopPackageJson() {
  const appRoot = appRootFromHere();
  const pkgPath = path.join(appRoot, "package.json");
  const raw = fs.readFileSync(pkgPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * electron-builder afterAllArtifactBuild hook.
 *
 * Builds a styled DMG from the signed .app using appdmg, then optionally
 * signs and notarizes the DMG.
 *
 * DMG signing: requires CSC_NAME env var.
 * DMG notarization: requires NOTARIZE=1 + notarytool auth env vars.
 */
module.exports = async function afterAllArtifactBuild(context) {
  if (process.platform !== "darwin") {
    return;
  }

  const outDir =
    context.outDir && typeof context.outDir === "string" ? context.outDir : process.cwd();
  const appOutDirGuess = path.join(outDir, `mac-${process.arch}`);
  const appOutDir =
    (context.appOutDir && typeof context.appOutDir === "string" ? context.appOutDir : null) ||
    appOutDirGuess;
  const appBundle = findFirstAppBundle(appOutDir);
  if (!appBundle) {
    throw new Error(
      `[hermes-desktop] afterAllArtifactBuild: app bundle not found in: ${appOutDir}`
    );
  }

  const pkg = readDesktopPackageJson();
  const productName =
    (pkg &&
      pkg.build &&
      typeof pkg.build.productName === "string" &&
      pkg.build.productName.trim()) ||
    "Atomic Hermes";
  const version = (pkg && typeof pkg.version === "string" && pkg.version.trim()) || "0.0.0";

  const dmgPath = path.join(outDir, `${productName}-${version}-${process.arch}.dmg`);
  const rebuildScript = path.resolve(__dirname, "build-dmg-from-app.sh");
  if (!fs.existsSync(rebuildScript)) {
    throw new Error(
      `[hermes-desktop] afterAllArtifactBuild: DMG build script missing: ${rebuildScript}`
    );
  }

  // Rebuild macos-alias for system Node if appdmg needs it
  const macosAliasDir = path.join(appRootFromHere(), "node_modules", "macos-alias");
  if (fs.existsSync(path.join(macosAliasDir, "binding.gyp"))) {
    console.log("[hermes-desktop] afterAllArtifactBuild: rebuilding macos-alias for system Node");
    run("npx", ["node-gyp", "rebuild"], { cwd: macosAliasDir, stdio: "inherit" });
  }

  console.log(
    `[hermes-desktop] afterAllArtifactBuild: building DMG from app: ${path.basename(appBundle)}`
  );
  run("bash", [rebuildScript, appBundle, dmgPath], {
    stdio: "inherit",
    env: {
      ...process.env,
      DMG_VOLUME_NAME: `${productName} ${version}-${process.arch}`,
      DMG_MARGIN_MB: String(process.env.DMG_MARGIN_MB || "300"),
    },
  });

  const cscName = process.env.CSC_NAME && String(process.env.CSC_NAME).trim();
  if (cscName) {
    console.log(`[hermes-desktop] afterAllArtifactBuild: signing DMG with CSC_NAME: ${cscName}`);
    run("codesign", ["--force", "--sign", cscName, "--timestamp", dmgPath], {
      stdio: "inherit",
      env: process.env,
    });
    run("codesign", ["--verify", "--verbose=4", dmgPath], { stdio: "inherit", env: process.env });
  } else {
    console.log(
      "[hermes-desktop] afterAllArtifactBuild: CSC_NAME not set (skipping DMG signing)"
    );
  }

  const notarizeEnabled = String(process.env.NOTARIZE || "").trim() === "1";
  if (!notarizeEnabled) {
    console.log(
      "[hermes-desktop] afterAllArtifactBuild: NOTARIZE=1 not set (skipping DMG notarization)"
    );
    return;
  }

  if (!hasNotaryAuthEnv()) {
    throw new Error(
      [
        "[hermes-desktop] afterAllArtifactBuild: notary auth missing.",
        "Set NOTARYTOOL_PROFILE (keychain profile) OR NOTARYTOOL_KEY/NOTARYTOOL_KEY_ID/NOTARYTOOL_ISSUER (API key).",
      ].join("\n")
    );
  }

  console.log(`[hermes-desktop] afterAllArtifactBuild: notarizing DMG: ${dmgPath}`);

  const notaryArgs = ["notarytool", "submit", dmgPath, "--wait"];
  if (process.env.NOTARYTOOL_PROFILE) {
    notaryArgs.push("--keychain-profile", process.env.NOTARYTOOL_PROFILE.trim());
  } else {
    notaryArgs.push(
      "--key", process.env.NOTARYTOOL_KEY.trim(),
      "--key-id", process.env.NOTARYTOOL_KEY_ID.trim(),
      "--issuer", process.env.NOTARYTOOL_ISSUER.trim()
    );
  }

  run("xcrun", notaryArgs, { stdio: "inherit", env: process.env });

  console.log("[hermes-desktop] afterAllArtifactBuild: stapling ticket to DMG...");
  run("xcrun", ["stapler", "staple", dmgPath], { stdio: "inherit" });

  console.log("[hermes-desktop] afterAllArtifactBuild: DMG notarization complete");
};
