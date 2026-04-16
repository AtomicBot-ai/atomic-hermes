import { useNavigate } from "react-router-dom";
import { SplashLogo, PrimaryButton, FooterText } from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics";
import { OnboardingHeader } from "./OnboardingHeader";
import { useSetup } from "./setup-context";
import s from "./WelcomeStep.module.css";

export function WelcomeStep() {
  useOnboardingStepEvent("welcome", null);
  const navigate = useNavigate();
  const { skip } = useSetup();

  return (
    <>
      <OnboardingHeader totalSteps={0} activeStep={0} />
      <div className={s.stage}>
        <div className={s.center}>
          <SplashLogo size={72} />
          <div className={s.title}>Welcome to Atomic Hermes</div>

          <PrimaryButton
            className={s.primaryBtn}
            onClick={() => void navigate("setup-mode")}
          >
            Get Started
          </PrimaryButton>

          <button type="button" className={s.secondaryBtn} onClick={skip}>
            Skip setup
          </button>
        </div>
        <FooterText>Powered by Atomic Hermes</FooterText>
      </div>
    </>
  );
}
