import { ipcMain } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

import {
  detectActiveProfile,
  listProfiles,
  resolveProfileHome,
  listMemoryFiles,
  readMemoryFile,
  writeMemoryFile,
  listSkills,
  readSkillFile,
  readFavorites,
  writeFavorites,
  type FavoriteEntry,
} from "./profile-resolver";

let _selectedProfile = "default";

export function registerSidebarIpcHandlers(params: { stateDir: string }) {
  const { stateDir } = params;

  _selectedProfile = detectActiveProfile(stateDir);

  ipcMain.handle("sidebar:list-profiles", () => {
    const profiles = listProfiles(stateDir);
    return { profiles: profiles.map((p) => p.name), selected: _selectedProfile };
  });

  ipcMain.handle(
    "sidebar:select-profile",
    (_evt, p: { profileName?: unknown }) => {
      const name = typeof p?.profileName === "string" ? p.profileName : "default";
      _selectedProfile = name;
      return { ok: true, selected: _selectedProfile };
    },
  );

  ipcMain.handle("sidebar:get-profile-home", () => {
    return resolveProfileHome(stateDir, _selectedProfile);
  });

  ipcMain.handle("sidebar:list-memories", () => {
    return listMemoryFiles(stateDir, _selectedProfile);
  });

  ipcMain.handle(
    "sidebar:read-memory-file",
    (_evt, p: { filename?: unknown }) => {
      const filename = typeof p?.filename === "string" ? p.filename : "";
      if (!filename) throw new Error("filename is required");
      return readMemoryFile(stateDir, _selectedProfile, filename);
    },
  );

  ipcMain.handle(
    "sidebar:write-memory-file",
    (_evt, p: { filename?: unknown; content?: unknown }) => {
      const filename = typeof p?.filename === "string" ? p.filename : "";
      const content = typeof p?.content === "string" ? p.content : "";
      if (!filename) throw new Error("filename is required");
      writeMemoryFile(stateDir, _selectedProfile, filename, content);
      return { ok: true };
    },
  );

  ipcMain.handle("sidebar:list-skills", () => {
    return listSkills(stateDir, _selectedProfile);
  });

  ipcMain.handle(
    "sidebar:read-skill-file",
    (_evt, p: { skillDir?: unknown }) => {
      const skillDir = typeof p?.skillDir === "string" ? p.skillDir : "";
      if (!skillDir) throw new Error("skillDir is required");
      return readSkillFile(stateDir, _selectedProfile, skillDir);
    },
  );

  ipcMain.handle("sidebar:get-favorites", () => {
    return readFavorites(stateDir);
  });

  ipcMain.handle(
    "sidebar:set-favorites",
    (_evt, p: { entries?: unknown }) => {
      const entries = Array.isArray(p?.entries) ? (p.entries as FavoriteEntry[]) : [];
      writeFavorites(stateDir, entries);
      return { ok: true };
    },
  );

  ipcMain.handle(
    "seed-profile-provider",
    (_evt, p: { source: string; target: string }) => {
      const src = resolveProfileHome(stateDir, p.source);
      const tgt = resolveProfileHome(stateDir, p.target);

      const srcConfig = path.join(src.profileHome, "config.yaml");
      const srcEnv = path.join(src.profileHome, ".env");
      const tgtConfig = path.join(tgt.profileHome, "config.yaml");
      const tgtEnv = path.join(tgt.profileHome, ".env");

      try {
        if (fs.existsSync(srcConfig)) {
          const raw = fs.readFileSync(srcConfig, "utf-8");
          const doc = yaml.load(raw) as Record<string, unknown> | null;
          if (doc && typeof doc === "object") {
            const seed: Record<string, unknown> = {};
            if (doc.model != null) seed.model = doc.model;
            if (doc.provider != null) seed.provider = doc.provider;
            if (doc.base_url != null) seed.base_url = doc.base_url;

            if (Object.keys(seed).length > 0) {
              let existing: Record<string, unknown> = {};
              if (fs.existsSync(tgtConfig)) {
                const tgtRaw = fs.readFileSync(tgtConfig, "utf-8");
                const tgtDoc = yaml.load(tgtRaw);
                if (tgtDoc && typeof tgtDoc === "object") {
                  existing = tgtDoc as Record<string, unknown>;
                }
              }
              Object.assign(existing, seed);
              fs.mkdirSync(path.dirname(tgtConfig), { recursive: true });
              fs.writeFileSync(tgtConfig, yaml.dump(existing, { lineWidth: -1, noRefs: true }), "utf-8");
            }
          }
        }

        if (fs.existsSync(srcEnv)) {
          fs.mkdirSync(path.dirname(tgtEnv), { recursive: true });
          fs.copyFileSync(srcEnv, tgtEnv);
        }

        return { ok: true };
      } catch (err) {
        console.error("[seed-profile-provider] failed:", err);
        return { ok: false, error: String(err) };
      }
    },
  );
}
