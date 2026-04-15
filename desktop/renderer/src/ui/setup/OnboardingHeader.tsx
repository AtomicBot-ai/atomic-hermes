import { OnboardingDots } from "@shared/kit";
import s from "./OnboardingHeader.module.css";

export type OnboardingHeaderProps = {
  totalSteps: number;
  activeStep: number;
  onBack?: () => void;
  onSkip?: () => void;
  backDisabled?: boolean;
};

export function OnboardingHeader({
  totalSteps,
  activeStep,
  onBack,
  onSkip,
  backDisabled,
}: OnboardingHeaderProps) {
  return (
    <div className={s.header}>
      {onBack ? (
        <div className={s.side}>
          <button
            className={s.textButton}
            type="button"
            onClick={onBack}
            disabled={backDisabled}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="1.33333"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>
        </div>
      ) : (
        <div className={s.side} />
      )}
      <div className={s.center}>
        <OnboardingDots totalSteps={totalSteps} activeStep={activeStep} />
      </div>
      <div className={`${s.side} ${s.sideRight}`}>
        {onSkip ? (
          <button className={s.textButton} type="button" onClick={onSkip}>
            Skip
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
