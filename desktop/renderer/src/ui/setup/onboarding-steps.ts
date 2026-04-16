/** Step indices for onboarding progress (OnboardingDots), per branch after setup-mode. */

export const API_KEYS_FLOW = {
  totalSteps: 6,
  steps: {
    welcome: 0,
    setupMode: 1,
    provider: 2,
    apiKey: 3,
    model: 4,
    finish: 5,
  },
} as const;

export const LOCAL_MODEL_FLOW = {
  totalSteps: 5,
  steps: {
    welcome: 0,
    setupMode: 1,
    backendDownload: 2,
    modelSelect: 3,
    finish: 4,
  },
} as const;
