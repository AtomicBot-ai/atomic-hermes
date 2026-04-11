import React from "react";

export function InlineError({ children }: { children: React.ReactNode }) {
  return <div className="UiInlineError">{children}</div>;
}

export function FooterText({ children }: { children: React.ReactNode }) {
  return <div className="UiFooterText">{children}</div>;
}
