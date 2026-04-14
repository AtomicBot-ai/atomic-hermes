import React from "react";
import type { SkillSummary } from "../../../services/skills-api";
import { SkillCardMenu } from "./CustomSkillMenu";
import s from "./SkillsGrid.module.css";

type Props = {
  skills: SkillSummary[];
  search: string;
  onEdit?: (name: string) => void;
  onToggle: (name: string) => void;
  onRemove: (name: string) => void;
};

function matchesSearch(skill: SkillSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q) ||
    (skill.category || "").toLowerCase().includes(q) ||
    (skill.tags || []).some((t) => t.toLowerCase().includes(q))
  );
}

export function SkillsGrid({ skills, search, onEdit, onToggle, onRemove }: Props) {
  const filtered = React.useMemo(
    () => skills.filter((sk) => matchesSearch(sk, search)),
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
        {filtered.map((skill) => (
          <div
            key={skill.dirName || skill.name}
            className={`UiSkillCard${!skill.enabled ? " UiSkillCard--disabled" : ""}`}
          >
            <div className="UiSkillTopRow">
              <span className={`UiSkillIcon${!skill.trigger ? " UiSkillIcon--custom" : ""}`}>
                {skill.emoji || skill.name.charAt(0).toUpperCase()}
                {skill.enabled && (
                  <span className="UiProviderTileCheck" aria-label="Enabled">
                    ✓
                  </span>
                )}
              </span>
              <div className="UiSkillTopRight">
                <SkillCardMenu
                  enabled={skill.enabled}
                  onEdit={onEdit ? () => onEdit(skill.name) : undefined}
                  onToggle={() => onToggle(skill.name)}
                  onRemove={() => onRemove(skill.name)}
                />
              </div>
            </div>
            <div className="UiSkillName">{skill.name}</div>
            <div className="UiSkillDescription">{skill.description}</div>
            {skill.tags && skill.tags.length > 0 && (
              <div className={s.tags}>
                {skill.tags.slice(0, 5).map((tag) => (
                  <span key={tag} className={s.tag}>{tag}</span>
                ))}
              </div>
            )}
            <div className={s.cardFooter}>
              {skill.author && <span className={s.meta}>{skill.author}</span>}
              {skill.category && (
                <span className={`${s.badge} ${s.badgeCategory}`}>{skill.category}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
