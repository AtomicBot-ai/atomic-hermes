import { routes } from "../app/routes";

export type SettingsTabId =
  | "models"
  | "skills"
  | "connectors"
  | "voice"
  | "mcpServers"
  | "other";

export type SettingsTabDef = {
  id: SettingsTabId;
  path: string;
  href: string;
  label: string;
  title: string;
  description: string;
};

export const SETTINGS_TABS: SettingsTabDef[] = [
  {
    id: "models",
    path: "ai-models",
    href: routes.settingsModels,
    label: "AI Models",
    title: "AI Models",
    description: "Choose a provider, configure access, and select the default model.",
  },
  {
    id: "skills",
    path: "skills",
    href: routes.settingsSkills,
    label: "Skills",
    title: "Skills",
    description: "Browse, install, and configure Hermes skills.",
  },
  {
    id: "connectors",
    path: "messengers",
    href: routes.settingsMessengers,
    label: "Messengers",
    title: "Messengers",
    description: "Connect chat platforms and automation channels.",
  },
  {
    id: "voice",
    path: "voice",
    href: routes.settingsVoice,
    label: "Voice",
    title: "Voice",
    description: "Manage speech-to-text and voice input preferences.",
  },
  {
    id: "mcpServers",
    path: "mcp-servers",
    href: routes.settingsMcpServers,
    label: "MCP Servers",
    title: "MCP Servers",
    description: "Review Model Context Protocol server integrations.",
  },
  {
    id: "other",
    path: "other",
    href: routes.settingsOther,
    label: "Other",
    title: "Other",
    description: "See app information and upcoming advanced settings.",
  },
];

export const DEFAULT_SETTINGS_TAB = SETTINGS_TABS[0];
