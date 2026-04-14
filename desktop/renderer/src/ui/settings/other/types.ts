export type SecurityLevel = "balanced" | "permissive";

export type ExecApprovalsFile = {
  version: 1;
  socket?: { path?: string; token?: string };
  defaults?: {
    security?: string;
    ask?: string;
    askFallback?: string;
    autoAllowSkills?: boolean;
  };
  agents?: Record<
    string,
    {
      security?: string;
      ask?: string;
      askFallback?: string;
      autoAllowSkills?: boolean;
      allowlist?: { pattern: string }[];
    }
  >;
};

export type ExecApprovalsSnapshot = {
  path: string;
  exists: boolean;
  hash: string;
  file: ExecApprovalsFile;
};

export function deriveSecurityLevel(file: ExecApprovalsFile): SecurityLevel {
  const security = file.defaults?.security ?? "allowlist";
  const ask = file.defaults?.ask ?? "on-miss";
  if (security === "full" && ask === "off") return "permissive";
  return "balanced";
}

export function applySecurityLevel(
  file: ExecApprovalsFile,
  level: SecurityLevel,
): ExecApprovalsFile {
  const defaults = { ...file.defaults };
  switch (level) {
    case "balanced":
      defaults.security = "allowlist";
      defaults.ask = "on-miss";
      defaults.autoAllowSkills = true;
      break;
    case "permissive":
      defaults.security = "full";
      defaults.ask = "off";
      break;
  }
  return { ...file, defaults };
}
