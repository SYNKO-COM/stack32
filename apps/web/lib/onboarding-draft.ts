/**
 * Persists in-progress onboarding answers in the browser so a refresh
 * restores the current step and selections.
 */

const KEY_PREFIX = "stack32.onboardingDraft.";

export interface OnboardingDraft {
  version?: 2;
  step: number;
  goal: string;
  audience: string;
  outcome: string;
  showIntro: boolean;
  discoverySource: string | null;
  role: string | null;
  firstName: string;
  username: string;
  countryCode: string;
  phone: string;
  useCase: string;
  workspaceName: string;
}

const DEFAULT_DRAFT: OnboardingDraft = {
  version: 2,
  step: 1,
  goal: "",
  audience: "",
  outcome: "",
  showIntro: true,
  discoverySource: null,
  role: null,
  firstName: "",
  username: "",
  countryCode: "+33",
  phone: "",
  useCase: "",
  workspaceName: "",
};

function storageKey(userId: string): string {
  return KEY_PREFIX + userId;
}

function isValidStep(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9;
}

export function readOnboardingDraft(userId: string): OnboardingDraft {
  if (typeof window === "undefined" || !userId) return { ...DEFAULT_DRAFT };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_DRAFT };
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    const hasProgress =
      (typeof parsed.step === "number" && parsed.step > 1) ||
      Boolean(parsed.discoverySource) ||
      Boolean(parsed.role) ||
      Boolean(parsed.firstName) ||
      Boolean(parsed.username) ||
      Boolean(parsed.workspaceName);
    return {
      version: 2,
      step: parsed.version === 2 && isValidStep(parsed.step) ? parsed.step : 1,
      goal: typeof parsed.goal === "string" ? parsed.goal : "",
      audience: typeof parsed.audience === "string" ? parsed.audience : "",
      outcome: typeof parsed.outcome === "string" ? parsed.outcome : "",
      showIntro: !hasProgress && parsed.showIntro !== false,
      discoverySource: typeof parsed.discoverySource === "string" ? parsed.discoverySource : null,
      role: typeof parsed.role === "string" ? parsed.role : null,
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      username: typeof parsed.username === "string" ? parsed.username : "",
      countryCode: typeof parsed.countryCode === "string" ? parsed.countryCode : "+33",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      useCase: typeof parsed.useCase === "string" ? parsed.useCase : "",
      workspaceName: typeof parsed.workspaceName === "string" ? parsed.workspaceName : "",
    };
  } catch {
    return { ...DEFAULT_DRAFT };
  }
}

export function writeOnboardingDraft(userId: string, draft: OnboardingDraft): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(draft));
  } catch {
    // Quota / private mode — onboarding still works without persistence.
  }
}

export function clearOnboardingDraft(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}
