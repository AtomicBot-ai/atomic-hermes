import React from "react";

export function PrimaryButton(props: {
  children: React.ReactNode;
  size?: "sm";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`UiPrimaryButton ${props.size === "sm" && "UiPrimaryButtonSm"} ${props?.className}`}
      disabled={props.disabled || props.loading}
      onClick={props.onClick}
    >
      {props.loading ? <span className="UiButtonSpinner" aria-hidden="true" /> : null}
      {props.children}
    </button>
  );
}

export function SecondaryButton(props: {
  children: React.ReactNode;
  disabled?: boolean;
  size?: "sm";
  onClick: () => void;
}) {
  return (
    <button
      className={`UiSecondaryButton ${props.size === "sm" && "UiSecondaryButtonSm"}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="UiButtonRow">{children}</div>;
}

export function ActionButton(props: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  variant?: "secondary" | "primary";
  onClick: () => void;
  className?: string;
}) {
  const variant = props.variant ?? "secondary";
  const className =
    variant === "primary" ? "UiActionButton UiActionButton-primary " : "UiActionButton ";
  return (
    <button
      className={className + props.className}
      disabled={props.disabled || props.loading}
      onClick={props.onClick}
    >
      {props.loading ? <span className="UiButtonSpinner" aria-hidden="true" /> : null}
      {props.children}
    </button>
  );
}
