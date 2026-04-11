export type FeatureStatus = "connect" | "connected" | "disabled" | "coming-soon";

export function FeatureCta({
  status,
  onConnect,
  onSettings,
}: {
  status: FeatureStatus;
  onConnect?: () => void;
  onSettings?: () => void;
}) {
  if (status === "connected") {
    return (
      <div className="UiSkillConnectButtonContainer">
        <button
          type="button"
          onClick={onSettings}
          aria-label="Connected — click to configure"
          className="UiSkillConnectButton UiSkillConnectButtonConfigure"
        >
          Edit
        </button>
      </div>
    );
  }
  if (status === "disabled") {
    return (
      <button
        className="UiSkillConnectButton"
        type="button"
        aria-label="Connect"
        onClick={onSettings}
      >
        Connect
      </button>
    );
  }
  if (status === "coming-soon") {
    return (
      <span className="UiSkillStatus UiSkillStatus--soon" aria-label="Coming soon">
        Coming Soon
      </span>
    );
  }
  return (
    <button
      className="UiSkillConnectButton"
      type="button"
      disabled={!onConnect}
      title={onConnect ? "Connect" : "Not available yet"}
      onClick={onConnect}
    >
      Connect
    </button>
  );
}
