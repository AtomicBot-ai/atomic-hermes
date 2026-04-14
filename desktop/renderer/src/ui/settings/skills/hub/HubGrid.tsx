import React from "react";
import type { HubSkillItem } from "../../../../services/skills-api";
import s from "./HubGrid.module.css";

type Props = {
  items: HubSkillItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onInstall: (identifier: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onInstalled?: () => void;
};

function SkeletonCard() {
  return <div className={`UiSkillCard ${s.card} ${s.skeleton}`}><div className={s.skeletonBar} /></div>;
}

export function HubGrid({ items, loading, hasMore, onLoadMore, onInstall, onRemove, onInstalled }: Props) {
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const [busyIds, setBusyIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  const handleToggle = React.useCallback(
    async (skill: HubSkillItem) => {
      const key = skill.slug || skill.name;
      setBusyIds((prev) => new Set(prev).add(key));
      try {
        if (skill.installed) {
          await onRemove(skill.name);
        } else {
          await onInstall(skill.identifier || skill.slug || skill.name);
        }
        onInstalled?.();
      } catch {
        // Silently fail for now
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [onInstall, onRemove, onInstalled],
  );

  if (!loading && items.length === 0) {
    return (
      <div className={s.empty}>
        No skills found. Try a different search term.
      </div>
    );
  }

  return (
    <div className="UiSkillsScroll">
      <div className="UiSkillsGrid">
        {items.map((skill) => {
          const key = skill.slug || skill.name;
          const busy = busyIds.has(key);
          return (
            <div key={key} className={`UiSkillCard ${s.card}`}>
              <div className="UiSkillTopRow">
                <span className="UiSkillIcon UiSkillIcon--custom">
                  {skill.emoji || skill.name.charAt(0).toUpperCase()}
                  {skill.installed ? (
                    <span className="UiProviderTileCheck" aria-label="Installed">
                      ✓
                    </span>
                  ) : null}
                </span>
                <div className="UiSkillTopRight">
                  <button
                    type="button"
                    className={`UiSkillConnectButton ${skill.installed ? s.actionRemove : ""}`}
                    disabled={busy}
                    onClick={() => void handleToggle(skill)}
                  >
                    {busy ? "..." : skill.installed ? "Remove" : "Install"}
                  </button>
                </div>
              </div>
              <div className="UiSkillName">{skill.displayName || skill.name}</div>
              <div className="UiSkillDescription">
                {skill.summary || skill.description || ""}
              </div>
              <div className={s.cardFooter}>
                {skill.author && <span className={s.meta}>{skill.author}</span>}
                {typeof skill.stars === "number" && (
                  <span className={s.meta}>★ {skill.stars}</span>
                )}
                {typeof skill.downloads === "number" && (
                  <span className={s.meta}>↓ {skill.downloads}</span>
                )}
                {skill.source === "official" && (
                  <span className={`${s.badge} ${s.badgeOfficial}`}>OFFICIAL</span>
                )}
                {skill.trust_level === "trusted" && (
                  <span className={`${s.badge} ${s.badgeTrusted}`}>TRUSTED</span>
                )}
                {skill.trust_level === "community" && (
                  <span className={`${s.badge} ${s.badgeCommunity}`}>COMMUNITY</span>
                )}
              </div>
            </div>
          );
        })}

        {loading &&
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={`skel-${i}`} />)}
      </div>

      {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
    </div>
  );
}
