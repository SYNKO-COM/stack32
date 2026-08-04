/**
 * Persists in-progress onboarding answers in the browser so a refresh
 * restores the current step and selections.
 */

const KEY_PREFIX = "stack32.onboardingDraft.";

export interface OnboardingDraft {
  step: 1 | 2 | 3;
  showIntro: boolean;
  discoverySource: string | null;
  role: string | null;
  firstName: string;
  countryCode: string;
  phone: string;
  useCase: string;
}

const DEFAULT_DRAFT: OnboardingDraft = {
  step: 1,
  showIntro: true,
  discoverySource: null,
  role: null,
  firstName: "",
  countryCode: "+33",
  phone: "",
  useCase: "",
};

function storageKey(userId: string): string {
  return KEY_PREFIX + userId;
}

function isValidStep(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
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
      Boolean(parsed.firstName);
    return {
      step: isValidStep(parsed.step) ? parsed.step : 1,
      // Skip the welcome animation once the user has started answering.
      showIntro: !hasProgress && parsed.showIntro !== false,
      discoverySource: typeof parsed.discoverySource === "string" ? parsed.discoverySource : null,
      role: typeof parsed.role === "string" ? parsed.role : null,
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      countryCode: typeof parsed.countryCode === "string" ? parsed.countryCode : "+33",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      useCase: typeof parsed.useCase === "string" ? parsed.useCase : "",
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
