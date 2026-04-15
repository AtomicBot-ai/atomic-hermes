/**
 * Update splash -- thin wrapper that shows a native JXA floating window on
 * macOS before quitAndInstall, so the user sees continuous feedback instead of
 * a blank screen during the restart gap. No-op on other platforms.
 */

import { app } from "electron";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const SENTINEL_FILENAME = "update-splash.pid";
const TEMP_SCRIPT_NAME = "hermes-update-splash.js";
const BUNDLE_ID = "com.nousresearch.hermes-agent";

const JXA_SCRIPT = /* js */ `
function run(argv) {
  var oldPid = parseInt(argv[0], 10) || 0;
  var sentinelPath = argv[1] || '';
  var bundleId = argv[2] || '${BUNDLE_ID}';

  ObjC.import('Cocoa');

  var nsApp = $.NSApplication.sharedApplication;
  nsApp.setActivationPolicy(2);

  if (sentinelPath) {
    var pid = $.NSProcessInfo.processInfo.processIdentifier;
    var pidStr = $.NSString.stringWithFormat('%d', pid);
    pidStr.writeToFileAtomicallyEncodingError(sentinelPath, true, 4, null);
  }

  var W = 360, H = 180;
  var styleMask = 1 | (1 << 15);
  var win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(0, 0, W, H), styleMask, 2, false
  );

  win.titlebarAppearsTransparent = true;
  win.titleVisibility = 1;
  win.standardWindowButton(0).hidden = true;
  win.standardWindowButton(1).hidden = true;
  win.standardWindowButton(2).hidden = true;
  win.isMovableByWindowBackground = true;
  win.level = 3;
  win.hasShadow = true;
  win.backgroundColor = $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.043, 0.059, 0.078, 1.0);

  try {
    win.appearance = $.NSAppearance.appearanceNamed('NSAppearanceNameDarkAqua');
  } catch (e) {
    console.log('[darwin JXA] NSAppearance dark aqua failed:', e);
  }

  win.collectionBehavior = 1 << 0;

  var cv = win.contentView;
  var cw = cv.bounds.size.width;
  var ch = cv.bounds.size.height;

  var gapTitleSubtitle = 4;
  var gapLoaderTitle = 14;
  var subtitleH = 20, titleH = 28, spinnerSz = 40;
  var blockH = subtitleH + gapTitleSubtitle + titleH + gapLoaderTitle + spinnerSz;
  var baseY = (ch - blockH) / 2;

  function makeLabel(text, font, color, y, h) {
    var textW = cw;
    var textX = 0;
    try {
      var attrs = $.NSDictionary.dictionaryWithObjectForKey(font, $.NSFontAttributeName);
      var attrStr = $.NSAttributedString.alloc.init.initWithStringAttributes(text, attrs);
      var size = attrStr.size;
      var w = size.width;
      if (typeof w === 'number' && w > 0) {
        textW = Math.min(Math.ceil(w) + 16, cw);
        textX = (cw - textW) / 2;
      }
    } catch (e) {
      console.log('[darwin JXA] attributed string sizing failed:', e);
    }
    var field = $.NSTextField.alloc.initWithFrame($.NSMakeRect(textX, y, textW, h));
    field.stringValue = text;
    field.setBezeled(false);
    field.setDrawsBackground(false);
    field.setEditable(false);
    field.setSelectable(false);
    field.textColor = color;
    field.font = font;
    field.cell.setAlignment(2);
    return field;
  }

  cv.addSubview(makeLabel(
    'Please wait\\u2026',
    $.NSFont.systemFontOfSize(12),
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.55, 0.6, 0.65, 1.0),
    baseY, subtitleH
  ));

  cv.addSubview(makeLabel(
    'Updating Atomic Hermes\\u2026',
    $.NSFont.systemFontOfSizeWeight(16, 0.5),
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.9, 0.93, 0.95, 1.0),
    baseY + subtitleH + gapTitleSubtitle, titleH
  ));

  var spinnerX = (cw - spinnerSz) / 2;
  var spinner = $.NSProgressIndicator.alloc.initWithFrame(
    $.NSMakeRect(spinnerX, baseY + subtitleH + gapTitleSubtitle + titleH + gapLoaderTitle, spinnerSz, spinnerSz)
  );
  spinner.style = 1;
  spinner.displayedWhenStopped = false;
  spinner.startAnimation(null);
  cv.addSubview(spinner);

  var screen = $.NSScreen.mainScreen.frame;
  var cx = (screen.size.width - W) / 2;
  var cy = (screen.size.height - H) / 2;
  win.setFrameDisplayAnimate($.NSMakeRect(cx, cy, W, H), true, false);
  win.makeKeyAndOrderFront(null);
  nsApp.activateIgnoringOtherApps(true);

  var MAX_SECONDS = 120;
  var POLL_INTERVAL = 1.0;
  var elapsed = 0;
  var oldPidDead = (oldPid === 0);

  while (elapsed < MAX_SECONDS) {
    $.NSRunLoop.currentRunLoop.runUntilDate(
      $.NSDate.dateWithTimeIntervalSinceNow(POLL_INTERVAL)
    );
    elapsed += POLL_INTERVAL;

    if (!oldPidDead) {
      var stillRunning = false;
      var allApps = $.NSWorkspace.sharedWorkspace.runningApplications;
      for (var i = 0; i < allApps.count; i++) {
        if (allApps.objectAtIndex(i).processIdentifier === oldPid) {
          stillRunning = true;
          break;
        }
      }
      if (!stillRunning) { oldPidDead = true; }
    }

    if (oldPidDead) {
      var allApps2 = $.NSWorkspace.sharedWorkspace.runningApplications;
      for (var j = 0; j < allApps2.count; j++) {
        var ra = allApps2.objectAtIndex(j);
        var bid = ra.bundleIdentifier;
        if (bid) {
          try {
            if (ObjC.unwrap(bid) === bundleId) {
              $.NSRunLoop.currentRunLoop.runUntilDate(
                $.NSDate.dateWithTimeIntervalSinceNow(2.5)
              );
              cleanup(sentinelPath);
              return;
            }
          } catch (e) {
            console.log('[darwin JXA] bundle identifier unwrap/compare failed:', e);
          }
        }
      }
    }
  }

  cleanup(sentinelPath);
}

function cleanup(sentinelPath) {
  if (sentinelPath) {
    try {
      $.NSFileManager.defaultManager.removeItemAtPathError(sentinelPath, null);
    } catch (e) {
      console.log('[darwin JXA] remove sentinel file failed:', e);
    }
  }
}
`;

/**
 * Show the native update splash window.
 * Should be called immediately before `autoUpdater.quitAndInstall()`.
 */
export function showUpdateSplash(): void {
  if (process.platform !== "darwin") {
    return;
  }
  try {
    const stateDir = path.join(app.getPath("userData"), "hermes");
    fs.mkdirSync(stateDir, { recursive: true });
    const sentinelPath = path.join(stateDir, SENTINEL_FILENAME);
    const scriptPath = path.join(os.tmpdir(), TEMP_SCRIPT_NAME);
    fs.writeFileSync(scriptPath, JXA_SCRIPT, "utf-8");

    const child = spawn(
      "osascript",
      ["-l", "JavaScript", scriptPath, String(process.pid), sentinelPath, BUNDLE_ID],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  } catch (err) {
    console.warn("[update-splash] showUpdateSplash failed:", err);
  }
}

/**
 * Kill a lingering update splash (if any).
 * Call this early during app startup.
 */
export function killUpdateSplash(): void {
  if (process.platform !== "darwin") {
    return;
  }
  try {
    const stateDir = path.join(app.getPath("userData"), "hermes");
    const sentinelPath = path.join(stateDir, SENTINEL_FILENAME);
    if (!fs.existsSync(sentinelPath)) {
      return;
    }
    const raw = fs.readFileSync(sentinelPath, "utf-8").trim();
    const pid = parseInt(raw, 10);
    if (pid > 0) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already dead
      }
    }
    fs.unlinkSync(sentinelPath);
  } catch (err) {
    console.warn("[update-splash] killUpdateSplash failed:", err);
  }
}
