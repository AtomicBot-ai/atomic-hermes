export const routes = {
  loading: "/loading",
  error: "/error",
  setup: "/setup",
  chat: "/chat",
  dashboard: "/dashboard",
  logs: "/logs",
  terminal: "/terminal",
  files: "/files",
  skills: "/skills",
  skillEdit: "/skills/edit/:name",
  settings: "/settings",
  // Legacy path that now redirects to the unified AI Models screen.
  settingsProviders: "/settings/ai-providers",
  settingsModels: "/settings/ai-models",
  settingsSkills: "/settings/skills",
  settingsMessengers: "/settings/messengers",
  settingsVoice: "/settings/voice",
  settingsMcpServers: "/settings/mcp-servers",
  settingsLocalModels: "/settings/local-models",
  settingsOther: "/settings/other",
} as const;

export function isBootstrapPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === routes.loading ||
    pathname === routes.error ||
    pathname.startsWith(routes.setup)
  );
}
