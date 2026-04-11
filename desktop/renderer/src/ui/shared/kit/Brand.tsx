import React from "react";

export function Brand({
  text = "HERMES AGENT",
  iconSrc,
  iconAlt = "",
}: {
  text?: string;
  iconSrc?: string;
  iconAlt?: string;
}) {
  return (
    <div className="UiBrand" aria-label={text}>
      {iconSrc ? (
        <img
          className="UiBrandIcon"
          src={iconSrc}
          alt={iconAlt}
          aria-hidden={iconAlt ? undefined : true}
        />
      ) : (
        <span className="UiBrandMark" aria-hidden="true">
          ⚕
        </span>
      )}
      <span className="UiBrandText">{text}</span>
    </div>
  );
}

export function SplashLogo({ iconSrc, iconAlt = "", size = 64 }: { iconSrc?: string; iconAlt?: string; size?: number }) {
  if (!iconSrc) {
    return (
      <div
        className="UiSplashLogo"
        style={{ width: size, height: size, display: "grid", placeItems: "center", fontSize: size * 0.6 }}
        aria-hidden={iconAlt ? undefined : true}
      >
        ⚕
      </div>
    );
  }
  return (
    <img
      className="UiSplashLogo"
      src={iconSrc}
      alt={iconAlt}
      aria-hidden={iconAlt ? undefined : true}
      width={size}
      height={size}
    />
  );
}

export function SpinningSplashLogo({
  iconSrc,
  iconAlt = "",
  className,
}: {
  iconSrc?: string;
  iconAlt?: string;
  className?: string;
}) {
  const merged = className
    ? `UiSplashLogo UiSplashLogo--spin ${className}`
    : "UiSplashLogo UiSplashLogo--spin";

  if (!iconSrc) {
    return (
      <div
        className={merged}
        style={{ width: 64, height: 64, display: "grid", placeItems: "center", fontSize: 38 }}
        aria-hidden={iconAlt ? undefined : true}
      >
        ⚕
      </div>
    );
  }
  return (
    <img
      className={merged}
      width={64}
      height={64}
      src={iconSrc}
      alt={iconAlt}
      aria-hidden={iconAlt ? undefined : true}
    />
  );
}
