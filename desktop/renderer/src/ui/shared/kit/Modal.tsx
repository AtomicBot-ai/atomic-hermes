import React from "react";
import { CloseIcon } from "./icons";

export function Modal(props: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  header?: string;
  "aria-label"?: string;
}) {
  const { open, onClose, children, header } = props;

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="UiModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={props["aria-label"]}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="UiModalCard">
        <div className="UiModalHeader">
          {header ? <div className="UiSectionTitle">{header}</div> : ""}
          <button className="UiModalClose" type="button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="UiModalContent scrollable">{children}</div>
      </div>
    </div>
  );
}
