import { PrimaryButton } from "@shared/kit";
import { OnboardingHeader } from "./OnboardingHeader";
import { useSetup } from "./setup-context";
import { TOTAL_STEPS } from "./SetupPage";
import { useNavigate } from "react-router-dom";
import s from "./FinishStep.module.css";

const CONFETTI_COLORS = [
  "#b0ff57",
  "#ff6b6b",
  "#4ecdc4",
  "#ffe66d",
  "#a855f7",
  "#06b6d4",
  "#fb923c",
  "#f472b6",
];

export function FinishStep() {
  const navigate = useNavigate();
  const { complete } = useSetup();

  return (
    <>
      <OnboardingHeader
        totalSteps={TOTAL_STEPS}
        activeStep={4}
        onBack={() => void navigate("../model", { relative: "path" })}
      />

      <div className={s.confettiLayer} aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className={s.confettiPiece}
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            }}
          />
        ))}
      </div>

      <div className={`SetupCard ${s.successCard}`}>
        <div className="SetupCard__content">
          <div className={s.checkmark}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="32" fill="#22c55e" />
              <path
                d="M20 32l8 8 16-16"
                stroke="#fff"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className={s.title}>ATOMIC HERMES IS READY!</h2>
          <p className={s.subtitle}>
            Chat with Atomic Hermes, follow tasks and get help anytime
          </p>
          <PrimaryButton onClick={complete}>Start chat</PrimaryButton>
        </div>
      </div>
    </>
  );
}
