import React from "react";
import type { GatewayState } from "@store/slices/gatewaySlice";
import { SkillsIntegrationsTab } from "../settings/skills/SkillsIntegrationsTab";
import { CustomSkillUploadModal } from "../settings/skills/CustomSkillUploadModal";
import { installSkill } from "../../services/skills-api";
import s from "./SkillsPage.module.css";

type Props = {
  state: Extract<GatewayState, { kind: "ready" }>;
};

export function SkillsPage({ state }: Props) {
  const [uploadOpen, setUploadOpen] = React.useState(false);

  const handleInstall = React.useCallback(
    async (identifier: string) => {
      const res = await installSkill(state.port, identifier);
      if (!res.ok) throw new Error(res.error || "Install failed");
    },
    [state.port],
  );

  return (
    <div className={s.root}>
      <div className={s.container}>
        <div className={s.header}>
          <h1 className={s.title}>Skills</h1>
          <button
            type="button"
            className={s.addBtn}
            onClick={() => setUploadOpen(true)}
          >
            + Add custom skill
          </button>
        </div>

        <SkillsIntegrationsTab port={state.port} noTitle />

        <CustomSkillUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onInstall={handleInstall}
        />
      </div>
    </div>
  );
}
