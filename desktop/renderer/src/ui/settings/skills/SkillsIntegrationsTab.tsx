import React from "react";
import { useNavigate } from "react-router-dom";
import { TextInput, ConfirmDialog } from "@shared/kit";
import { useSkillsStatus } from "./useSkillsStatus";
import { SkillsGrid } from "./SkillsGrid";
import { HubTab } from "./hub/HubTab";
import { uninstallSkill } from "../../../services/skills-api";
import s from "./SkillsIntegrationsTab.module.css";

type SubTab = "installed" | "hub";

type Props = {
  port: number;
  noTitle?: boolean;
};

export function SkillsIntegrationsTab({ port, noTitle }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<SubTab>("hub");
  const [search, setSearch] = React.useState("");
  const [removeTarget, setRemoveTarget] = React.useState<string | null>(null);

  const { skills, loading, error, statusMap, markConnected, markDisabled, refresh } =
    useSkillsStatus(port);

  const handleEdit = React.useCallback(
    (name: string) => {
      navigate(`/skills/edit/${encodeURIComponent(name)}`);
    },
    [navigate],
  );

  const handleToggle = React.useCallback(
    async (name: string) => {
      const status = statusMap[name];
      if (status === "connected") {
        await markDisabled(name);
      } else {
        await markConnected(name);
      }
    },
    [statusMap, markConnected, markDisabled],
  );

  const handleRemoveConfirm = React.useCallback(async () => {
    if (!removeTarget) return;
    try {
      await uninstallSkill(port, removeTarget);
      await refresh();
    } catch {
      // Silently fail for now
    }
    setRemoveTarget(null);
  }, [removeTarget, port, refresh]);

  return (
    <div className={s.root}>
      {!noTitle && <h3 className={s.title}>Skills</h3>}

      <div className={s.tabs}>
        <button
          type="button"
          className={`${s.tab} ${tab === "hub" ? s.tabActive : ""}`}
          onClick={() => setTab("hub")}
        >
          HermesHub
        </button>
        <button
          type="button"
          className={`${s.tab} ${tab === "installed" ? s.tabActive : ""}`}
          onClick={() => setTab("installed")}
        >
          Installed
        </button>
      </div>

      {tab === "installed" && (
        <>
          <div className={s.searchRow}>
            <TextInput
              value={search}
              onChange={setSearch}
              placeholder="Search installed skills…"
              isSearch
            />
          </div>
          {loading && (
            <div className={s.center}>Loading skills...</div>
          )}
          {error && (
            <div className={s.errorMsg}>{error}</div>
          )}
          {!loading && !error && (
            <SkillsGrid
              skills={skills}
              search={search}
              onEdit={handleEdit}
              onToggle={handleToggle}
              onRemove={(name) => setRemoveTarget(name)}
            />
          )}
        </>
      )}

      {tab === "hub" && <HubTab port={port} onInstalled={refresh} />}

      <ConfirmDialog
        open={!!removeTarget}
        title={`Remove "${removeTarget}"?`}
        subtitle="This will delete the skill from your local skills directory."
        confirmLabel="Remove"
        danger
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
