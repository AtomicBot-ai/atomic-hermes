/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
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

function hasNotaryAuthEnv() {
  if (process.env.NOTARYTOOL_PROFILE && String(process.env.NOTARYTOOL_PROFILE).trim()) {
    return true;
  }
  const key = process.env.NOTARYTOOL_KEY && String(process.env.NOTARYTOOL_KEY).trim();
  const keyId = process.env.NOTARYTOOL_KEY_ID && String(process.env.NOTARYTOOL_KEY_ID).trim();
  const issuer = process.env.NOTARYTOOL_ISSUER && String(process.env.NOTARYTOOL_ISSUER).trim();
  return Boolean(key && keyId && issuer);
}

/**
 * electron-builder afterSign hook.
 *
 * Notarizes the signed .app bundle via xcrun notarytool.
 * Only runs when NOTARIZE=1 is set — local builds skip this entirely.
 *
 * Auth: either NOTARYTOOL_PROFILE (keychain profile) or
 * NOTARYTOOL_KEY + NOTARYTOOL_KEY_ID + NOTARYTOOL_ISSUER (API key).
 */
module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const notarizeEnabled = String(process.env.NOTARIZE || "").trim() === "1";
  if (!notarizeEnabled) {
    console.log("[hermes-desktop] afterSign: NOTARIZE=1 not set (skipping notarization)");
    return;
  }

  if (!hasNotaryAuthEnv()) {
    throw new Error(
      [
        "[hermes-desktop] afterSign: notary auth missing.",
        "Set NOTARYTOOL_PROFILE (keychain profile) OR NOTARYTOOL_KEY/NOTARYTOOL_KEY_ID/NOTARYTOOL_ISSUER (API key).",
      ].join("\n")
    );
  }

  const appOutDir = context.appOutDir;
  const appBundle = findFirstAppBundle(appOutDir);
  if (!appBundle) {
    throw new Error(`[hermes-desktop] afterSign: failed to locate .app bundle in: ${appOutDir}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-notary-"));
  const appName = path.basename(appBundle, ".app");
  const zipPath = path.join(tmpDir, `${appName}.notary.zip`);

  try {
    console.log(`[hermes-desktop] afterSign: creating notary zip: ${zipPath}`);
    run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appBundle, zipPath], {
      stdio: "inherit",
    });

    console.log("[hermes-desktop] afterSign: submitting to notary service (xcrun notarytool)...");

    const notaryArgs = ["notarytool", "submit", zipPath, "--wait"];

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

    console.log("[hermes-desktop] afterSign: stapling ticket to .app...");
    run("xcrun", ["stapler", "staple", appBundle], { stdio: "inherit" });

    console.log("[hermes-desktop] afterSign: notarization complete");
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
};
