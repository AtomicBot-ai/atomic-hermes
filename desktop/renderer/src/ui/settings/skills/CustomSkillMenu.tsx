import React from "react";
import s from "./CustomSkillMenu.module.css";

type Props = {
  enabled: boolean;
  onEdit?: () => void;
  onToggle: () => void;
  onRemove: () => void;
};

export function SkillCardMenu({ enabled, onEdit, onToggle, onRemove }: Props) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={s.root} ref={ref}>
      <button
        type="button"
        className={s.trigger}
        aria-label="Skill actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className={s.popover}>
          {onEdit && (
            <button
              type="button"
              className={s.item}
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className={s.item}
            onClick={() => {
              setOpen(false);
              onToggle();
            }}
          >
            {enabled ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            className={`${s.item} ${s.itemDanger}`}
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
