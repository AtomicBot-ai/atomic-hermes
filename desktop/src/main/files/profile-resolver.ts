import * as fs from "fs";
import * as path from "path";

export type FavoriteEntry = {
  path: string;
  type: "file" | "dir";
  name: string;
};

export type SkillEntry = {
  name: string;
  description: string;
  dirPath: string;
};

export type MemoryFileInfo = {
  name: string;
  exists: boolean;
};

const ACTIVE_PROFILE_FILE = "active_profile";
const PROFILES_DIR = "profiles";
const MEMORIES_DIR = "memories";
const SKILLS_DIR = "skills";
const FAVORITES_FILE = "favorites.json";

export type ProfileInfo = {
  name: string;
  profileHome: string;
};

/**
 * List all available profiles: "default" (stateDir root) + any under stateDir/profiles/.
 */
export function listProfiles(stateDir: string): ProfileInfo[] {
  const result: ProfileInfo[] = [{ name: "default", profileHome: stateDir }];

  const profilesRoot = path.join(stateDir, PROFILES_DIR);
  try {
    if (fs.existsSync(profilesRoot)) {
      const dirs = fs.readdirSync(profilesRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."));
      for (const d of dirs) {
        result.push({ name: d.name, profileHome: path.join(profilesRoot, d.name) });
      }
    }
  } catch {
    // Can't read profiles dir
  }

  return result;
}

/**
 * Detect the currently active profile on startup.
 *
 * 1. stateDir/active_profile file — explicit sticky profile
 * 2. If exactly one profile dir exists — auto-select it
 * 3. Falls back to "default"
 */
export function detectActiveProfile(stateDir: string): string {
  try {
    const raw = fs.readFileSync(path.join(stateDir, ACTIVE_PROFILE_FILE), "utf-8").trim();
    if (raw && raw !== "default") {
      const profileDir = path.join(stateDir, PROFILES_DIR, raw);
      if (fs.existsSync(profileDir)) return raw;
    }
  } catch {
    // missing or unreadable
  }

  try {
    const profilesRoot = path.join(stateDir, PROFILES_DIR);
    if (fs.existsSync(profilesRoot)) {
      const dirs = fs.readdirSync(profilesRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."));
      if (dirs.length === 1) return dirs[0].name;
    }
  } catch {
    // can't read
  }

  return "default";
}

/**
 * Resolve profile home by explicit name.
 * "default" → stateDir root, anything else → stateDir/profiles/<name>.
 */
export function resolveProfileHome(stateDir: string, profileName: string): { profileHome: string; profileName: string } {
  if (profileName && profileName !== "default") {
    const profileDir = path.join(stateDir, PROFILES_DIR, profileName);
    if (fs.existsSync(profileDir)) {
      return { profileHome: profileDir, profileName };
    }
  }
  return { profileHome: stateDir, profileName: "default" };
}

export function listMemoryFiles(stateDir: string, profileName: string): MemoryFileInfo[] {
  const { profileHome } = resolveProfileHome(stateDir, profileName);
  const memDir = path.join(profileHome, MEMORIES_DIR);
  const names = ["MEMORY.md", "USER.md"] as const;

  return names.map((name) => {
    const filePath = path.join(memDir, name);
    return { name, exists: fs.existsSync(filePath) };
  });
}

export function readMemoryFile(stateDir: string, profileName: string, filename: string): { content: string; size: number; relativePath: string } {
  if (filename !== "MEMORY.md" && filename !== "USER.md") {
    throw new Error("Invalid memory filename");
  }
  const { profileHome } = resolveProfileHome(stateDir, profileName);
  const filePath = path.join(profileHome, MEMORIES_DIR, filename);
  const relativePath = path.relative(stateDir, filePath);

  if (!fs.existsSync(filePath)) {
    return { content: "", size: 0, relativePath };
  }

  const stat = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, "utf-8");
  return { content, size: stat.size, relativePath };
}

export function writeMemoryFile(stateDir: string, profileName: string, filename: string, content: string): void {
  if (filename !== "MEMORY.md" && filename !== "USER.md") {
    throw new Error("Invalid memory filename");
  }
  const { profileHome } = resolveProfileHome(stateDir, profileName);
  const memDir = path.join(profileHome, MEMORIES_DIR);
  fs.mkdirSync(memDir, { recursive: true });

  const filePath = path.join(memDir, filename);
  const tmp = filePath + ".tmp." + Date.now();
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, filePath);
}

function parseSkillFrontmatter(content: string): string {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return "";

  const yaml = match[1];
  const descLine = yaml
    .split("\n")
    .find((l) => l.startsWith("description:"));
  if (!descLine) return "";

  return descLine.replace(/^description:\s*/, "").replace(/^["']|["']$/g, "").trim();
}

export function listSkills(stateDir: string, profileName: string): SkillEntry[] {
  const { profileHome } = resolveProfileHome(stateDir, profileName);
  const skillsDir = path.join(profileHome, SKILLS_DIR);

  if (!fs.existsSync(skillsDir)) return [];

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const result: SkillEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;

    try {
      const content = fs.readFileSync(skillMd, "utf-8");
      const description = parseSkillFrontmatter(content);
      result.push({
        name: entry.name,
        description: description || "No description",
        dirPath: entry.name,
      });
    } catch {
      result.push({
        name: entry.name,
        description: "No description",
        dirPath: entry.name,
      });
    }
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

export function readSkillFile(stateDir: string, profileName: string, skillDir: string): { content: string; size: number; relativePath: string } {
  const { profileHome } = resolveProfileHome(stateDir, profileName);
  const safeName = path.basename(skillDir);
  const filePath = path.join(profileHome, SKILLS_DIR, safeName, "SKILL.md");

  if (!fs.existsSync(filePath)) {
    throw new Error("SKILL.md not found");
  }

  const stat = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, "utf-8");
  const relativePath = path.relative(stateDir, filePath);
  return { content, size: stat.size, relativePath };
}

export function readFavorites(stateDir: string): FavoriteEntry[] {
  const filePath = path.join(stateDir, FAVORITES_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: any) => typeof e.path === "string" && typeof e.type === "string" && typeof e.name === "string",
    );
  } catch {
    return [];
  }
}

export function writeFavorites(stateDir: string, entries: FavoriteEntry[]): void {
  const filePath = path.join(stateDir, FAVORITES_FILE);
  fs.mkdirSync(stateDir, { recursive: true });
  const tmp = filePath + ".tmp." + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}
