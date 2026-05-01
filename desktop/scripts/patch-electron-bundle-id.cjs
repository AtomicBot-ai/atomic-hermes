#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Patch Electron.app's CFBundleIdentifier so macOS LaunchServices can
 * uniquely associate `atomicbot-hermes://` deep-links with our dev binary
 * instead of routing them to any other Electron-based app installed on the
 * machine (e.g. openclaw). All Electron dev binaries ship with the same
 * bundle id `com.github.electron`, which makes deep-link routing
 * non-deterministic across multiple Electron projects on the same OS.
 *
 * The script is idempotent and a no-op on non-macOS platforms.
 *
 * After patching the Info.plist, we ad-hoc re-sign Electron.app (otherwise
 * macOS rejects the modified bundle) and force LaunchServices to refresh
 * its registration so the next `setAsDefaultProtocolClient` call points to
 * the new bundle id.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const NEW_BUNDLE_ID = "ai.atomicbot.hermes.dev";
const ORIGINAL_BUNDLE_ID = "com.github.electron";

const ELECTRON_APP = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "electron",
  "dist",
  "Electron.app",
);
const INFO_PLIST = path.join(ELECTRON_APP, "Contents", "Info.plist");

function log(message) {
  console.log(`[patch-electron-bundle-id] ${message}`);
}

function warn(message) {
  console.warn(`[patch-electron-bundle-id] ${message}`);
}

function main() {
  if (process.platform !== "darwin") {
    log("Skipping: macOS only");
    return;
  }

  if (!fs.existsSync(INFO_PLIST)) {
    log(`Skipping: ${INFO_PLIST} not found (electron not installed yet?)`);
    return;
  }

  const original = fs.readFileSync(INFO_PLIST, "utf8");

  if (original.includes(`<string>${NEW_BUNDLE_ID}</string>`)) {
    log(`Already patched (CFBundleIdentifier = ${NEW_BUNDLE_ID})`);
    return;
  }

  const patched = original.replace(
    /(<key>CFBundleIdentifier<\/key>\s*<string>)[^<]+(<\/string>)/,
    `$1${NEW_BUNDLE_ID}$2`,
  );

  if (patched === original) {
    console.error(
      "[patch-electron-bundle-id] FAILED: CFBundleIdentifier key not found in Info.plist",
    );
    process.exit(1);
  }

  fs.writeFileSync(INFO_PLIST, patched);
  log(`Patched CFBundleIdentifier: ${ORIGINAL_BUNDLE_ID} -> ${NEW_BUNDLE_ID}`);

  try {
    execSync(`codesign --force --deep --sign - "${ELECTRON_APP}"`, {
      stdio: "inherit",
    });
    log("Ad-hoc re-signed Electron.app");
  } catch (e) {
    warn(`codesign failed: ${e.message}. Electron may refuse to launch.`);
  }

  try {
    execSync(
      `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${ELECTRON_APP}"`,
      { stdio: "inherit" },
    );
    log("Re-registered Electron.app with LaunchServices");
  } catch (e) {
    warn(`lsregister refresh failed: ${e.message}`);
  }

  log("Done. macOS will now route atomicbot-hermes:// only to our Electron binary.");
}

main();
