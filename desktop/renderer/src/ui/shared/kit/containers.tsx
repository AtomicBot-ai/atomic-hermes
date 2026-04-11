import React from "react";

export function GlassCard({
  children,
  size = "default",
  className,
}: {
  children: React.ReactNode;
  size?: "default" | "wide";
  className?: string;
}) {
  const base = size === "wide" ? "UiGlassCard UiGlassCard-wide" : "UiGlassCard";
  const merged = className ? `${base} ${className}` : base;
  return <div className={merged}>{children}</div>;
}

export function ScrollBox({ children }: { children: React.ReactNode }) {
  return <div className="UiScrollBox">{children}</div>;
}
