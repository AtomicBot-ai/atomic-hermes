import React from "react";
import { FeatureCta } from "@shared/kit";
import type { FeatureStatus } from "@shared/kit";
import type { SkillSummary } from "../../../services/skills-api";
import { CustomSkillMenu } from "./CustomSkillMenu";

type Props = {
  skills: SkillSummary[];
  statusMap: Record<string, FeatureStatus>;
  search: string;
  onConnect: (name: string) => void;
  onSettings: (name: string) => void;
  onRemoveCustom?: (name: string) => void;
};

function matchesSearch(skill: SkillSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q) ||
    (skill.category || "").toLowerCase().includes(q)
  );
}

export function SkillsGrid({ skills, statusMap, search, onConnect, onSettings, onRemoveCustom }: Props) {
  const filtered = React.useMemo(
    () => skills.filter((s) => matchesSearch(s, search)),
    [skills, search],
  );

  if (filtered.length === 0) {
    return (
      <div style={{ padding: "24px 0", color: "#8e8e8e", textAlign: "center" }}>
        {search ? "No skills matching your search" : "No skills installed yet"}
      </div>
    );
  }

  return (
    <div className="UiSkillsScroll">
      <div className="UiSkillsGrid">
        {filtered.map((skill) => {
          const status = statusMap[skill.name] || "connect";
          const isCustom = !skill.trigger;

          return (
            <div
              key={skill.dirName || skill.name}
              className={`UiSkillCard${status === "disabled" ? " UiSkillCard--disabled" : ""}`}
            >
              <div className="UiSkillTopRow">
                <span className={`UiSkillIcon${isCustom ? " UiSkillIcon--custom" : ""}`}>
                  {skill.emoji || skill.name.charAt(0).toUpperCase()}
                  {status === "connected" && (
                    <span className="UiProviderTileCheck" aria-label="Connected">
                      ✓
                    </span>
                  )}
                </span>
                <div className="UiSkillTopRight">
                  {isCustom && onRemoveCustom ? (
                    <CustomSkillMenu onRemove={() => onRemoveCustom(skill.name)} />
                  ) : (
                    <FeatureCta
                      status={status}
                      onConnect={() => onConnect(skill.name)}
                      onSettings={() => onSettings(skill.name)}
                    />
                  )}
                </div>
              </div>
              <div className="UiSkillName">{skill.name}</div>
              <div className="UiSkillDescription">{skill.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
