import React from "react";

const SPLASH_ICON = new URL(
  "../../../../../assets/icon-simple-splash.png",
  import.meta.url,
).toString();

export function Brand({
  text = "Atomic Hermes",
  iconSrc,
  iconAlt = "",
}: {
  text?: string;
  iconSrc?: string;
  iconAlt?: string;
}) {
  return (
    <div className="UiBrand" aria-label={text}>
      <img
        className="UiBrandIcon"
        src={iconSrc || SPLASH_ICON}
        alt={iconAlt}
        aria-hidden={iconAlt ? undefined : true}
      />
      <span className="UiBrandText">{text}</span>
    </div>
  );
}

export function SplashLogo({ iconSrc, iconAlt = "", size = 64 }: { iconSrc?: string; iconAlt?: string; size?: number }) {
  return (
    <img
      className="UiSplashLogo"
      src={iconSrc || SPLASH_ICON}
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

  return (
    <img
      className={merged}
      width={64}
      height={64}
      src={iconSrc || SPLASH_ICON}
      alt={iconAlt}
      aria-hidden={iconAlt ? undefined : true}
    />
  );
}
