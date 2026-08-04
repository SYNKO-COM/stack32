/**
 * Pending prompt: preserves the prompt a visitor typed on the landing page
 * across signup, onboarding and (later) checkout, so it can initialize the
 * first agent build.
 */

const KEY = "stack32.pendingPrompt";

export function setPendingPrompt(prompt: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, prompt);
  } catch {
    // sessionStorage unavailable — the user will simply start from an empty composer.
  }
}

export function getPendingPrompt(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY);
}

export function consumePendingPrompt(): string | null {
  const prompt = getPendingPrompt();
  if (prompt !== null && typeof window !== "undefined") {
    window.sessionStorage.removeItem(KEY);
  }
  return prompt;
}

/**
 * Prefill draft: used by Structure-view actions ("Change in Build", …)
 * to open the Build composer with a prepared prompt.
 */
const PREFILL_KEY = "stack32.prefillDraft";

export function setPrefillDraft(prompt: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PREFILL_KEY, prompt);
}

export function consumePrefillDraft(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(PREFILL_KEY);
  if (value !== null) window.sessionStorage.removeItem(PREFILL_KEY);
  return value;
}
