import type { GatewayState } from "@store/slices/gatewaySlice";
import { SkillsIntegrationsTab } from "../settings/skills/SkillsIntegrationsTab";
import s from "./SkillsPage.module.css";

type Props = {
  state: Extract<GatewayState, { kind: "ready" }>;
};

export function SkillsPage({ state }: Props) {
  return (
    <div className={s.root}>
      <div className={s.container}>
        <div className={s.header}>
          <h1 className={s.title}>Skills</h1>
        </div>

        <SkillsIntegrationsTab port={state.port} noTitle />
      </div>
    </div>
  );
}
