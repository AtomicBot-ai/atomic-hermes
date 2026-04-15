import { useEffect, useRef, useState } from "react";
import styles from "./ThinkingBlock.module.css";

export type ThinkingBlockProps = {
  thinking?: string;
  actions?: string[];
  isStreaming?: boolean;
  defaultOpen?: boolean;
  reserveSpace?: boolean;
};

export function ThinkingBlock({
  thinking,
  actions = [],
  isStreaming,
  defaultOpen,
  reserveSpace,
}: ThinkingBlockProps) {
  const [open, setOpen] = useState(defaultOpen ?? isStreaming ?? false);
  const hasThinking = Boolean(thinking);
  const hasActions = actions.length > 0;
  const wasStreamingRef = useRef(Boolean(isStreaming));

  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
    } else if (wasStreamingRef.current && (hasThinking || hasActions)) {
      setOpen(false);
    }

    wasStreamingRef.current = Boolean(isStreaming);
  }, [hasActions, hasThinking, isStreaming]);

  if (!hasThinking && !hasActions && !reserveSpace) return null;
  if (!hasThinking && !hasActions && reserveSpace) {
    return <div className={styles.ThinkingReserve} aria-hidden="true" />;
  }

  return (
    <div
      className={`${styles.ThinkingBlock} ${isStreaming ? styles.ThinkingBlockStreaming : ""}`.trim()}
    >
      <button
        type="button"
        className={styles.ThinkingToggle}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          className={styles.ThinkingChevron}
          data-open={open}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 4 10 8 6 12" />
        </svg>
        <span
          className={`${styles.ThinkingLabel} ${isStreaming ? styles.ThinkingLabelShimmer : ""}`}
        >
          Thought process
        </span>
      </button>
      {open && (hasThinking || hasActions) && (
        <div className={styles.ThinkingContent}>
          {hasThinking && <div>{thinking}</div>}
          {hasActions && (
            <div className={styles.ThinkingActions}>
              <div className={styles.ThinkingSectionTitle}>Actions</div>
              <ul className={styles.ThinkingActionList}>
                {actions.map((action, index) => (
                  <li key={`${index}-${action}`} className={styles.ThinkingActionItem}>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
