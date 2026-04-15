import React from "react";
import type { SkillSummary } from "../../../services/skills-api";
import { fetchSkills, toggleSkill } from "../../../services/skills-api";
import type { FeatureStatus } from "@shared/kit";

export type SkillStatusMap = Record<string, FeatureStatus>;

export function useSkillsStatus(port: number) {
  const [skills, setSkills] = React.useState<SkillSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSkills(port);
      setSkills(res.skills);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, [port]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const statusMap = React.useMemo<SkillStatusMap>(() => {
    const map: SkillStatusMap = {};
    for (const s of skills) {
      map[s.name] = s.enabled ? "connected" : "disabled";
    }
    return map;
  }, [skills]);

  const markConnected = React.useCallback(
    async (name: string) => {
      await toggleSkill(port, name, true);
      setSkills((prev) => prev.map((s) => (s.name === name ? { ...s, enabled: true } : s)));
    },
    [port],
  );

  const markDisabled = React.useCallback(
    async (name: string) => {
      await toggleSkill(port, name, false);
      setSkills((prev) => prev.map((s) => (s.name === name ? { ...s, enabled: false } : s)));
    },
    [port],
  );

  return { skills, loading, error, statusMap, markConnected, markDisabled, refresh: load };
}
