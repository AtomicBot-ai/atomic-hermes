import { useSettingsState } from "../settings-context";
import { SkillsIntegrationsTab } from "./SkillsIntegrationsTab";

export function SkillsSettingsTab() {
  const { port } = useSettingsState();
  return <SkillsIntegrationsTab port={port} noTitle />;
}
