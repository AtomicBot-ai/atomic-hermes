import { ipcMain } from "electron";

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
}
