/** Step indices for onboarding progress (OnboardingDots), per branch after setup-mode. */

export const API_KEYS_FLOW = {
  totalSteps: 5,
  steps: {
    setupMode: 0,
    provider: 1,
    apiKey: 2,
    model: 3,
    finish: 4,
  },
} as const;

export const LOCAL_MODEL_FLOW = {
  totalSteps: 4,
  steps: {
    setupMode: 0,
    backendDownload: 1,
    modelSelect: 2,
    finish: 3,
  },
} as const;

export const ATOMIC_PAYG_FLOW = {
  totalSteps: 4,
  steps: {
    setupMode: 0,
    topup: 1,
    model: 2,
    finish: 3,
  },
} as const;
