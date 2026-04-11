import { useNavigate } from "react-router-dom";
import { SplashLogo, PrimaryButton, FooterText } from "@shared/kit";
import { OnboardingHeader } from "./OnboardingHeader";
import { useSetup } from "./setup-context";
import { TOTAL_STEPS } from "./SetupPage";
import s from "./WelcomeStep.module.css";

export function WelcomeStep() {
  const navigate = useNavigate();
  const { skip } = useSetup();

  return (
    <>
      <OnboardingHeader totalSteps={TOTAL_STEPS} activeStep={0} />
      <div className={s.stage}>
        <div className={s.center}>
          <SplashLogo size={72} />
          <div className={s.title}>Welcome to Atomic Hermes</div>

          <PrimaryButton
            className={s.primaryBtn}
            onClick={() => void navigate("provider")}
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
