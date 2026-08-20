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
const PREFILL_META_KEY = "stack32.prefillDraftMeta";

export function setPrefillDraft(
  prompt: string,
  opts?: { autoSend?: boolean },
): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PREFILL_KEY, prompt);
  window.sessionStorage.setItem(
    PREFILL_META_KEY,
    JSON.stringify({ autoSend: Boolean(opts?.autoSend) }),
  );
}

export function consumePrefillDraft(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(PREFILL_KEY);
  if (value !== null) window.sessionStorage.removeItem(PREFILL_KEY);
  return value;
}

/** Consume auto-send flag paired with the latest prefill draft. */
export function consumePrefillAutoSend(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.sessionStorage.getItem(PREFILL_META_KEY);
  if (raw !== null) window.sessionStorage.removeItem(PREFILL_META_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { autoSend?: boolean };
    return Boolean(parsed.autoSend);
  } catch {
    return false;
  }
}

/** Read-and-clear draft + autoSend together so they cannot get out of sync. */
export function consumePrefillPayload(): { draft: string | null; autoSend: boolean } {
  const draft = consumePrefillDraft();
  const autoSend = consumePrefillAutoSend();
  return { draft, autoSend };
}

const SENDING_KEY = "stack32.prefillSending";
const TRY_TO_FIX_LOCK_KEY = "stack32.tryToFixLock";

/** Mark that the repair prompt is already being sent as a user message. */
export function markPrefillSending(prompt: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SENDING_KEY, prompt);
}

export function takePrefillSending(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(SENDING_KEY);
  if (value !== null) window.sessionStorage.removeItem(SENDING_KEY);
  return value;
}

type TryToFixLock = {
  agentId: string;
  fingerprint: string;
  at: number;
};

const TRY_TO_FIX_TTL_MS = 3 * 60_000;

function readTryToFixLock(): TryToFixLock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TRY_TO_FIX_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TryToFixLock;
    if (!parsed?.agentId || !parsed?.fingerprint || typeof parsed.at !== "number") {
      return null;
    }
    if (Date.now() - parsed.at > TRY_TO_FIX_TTL_MS) {
      window.sessionStorage.removeItem(TRY_TO_FIX_LOCK_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** True when a Try-to-fix send is already in flight for this agent. */
export function isTryToFixLocked(agentId: string): boolean {
  const lock = readTryToFixLock();
  return Boolean(lock && lock.agentId === agentId);
}

/**
 * Atomically claim the single Try-to-fix send slot for an agent.
 * Returns false if a repair was already claimed (same or any fingerprint).
 */
export function claimTryToFix(agentId: string, fingerprint: string): boolean {
  if (typeof window === "undefined") return false;
  const existing = readTryToFixLock();
  if (existing && existing.agentId === agentId) {
    return false;
  }
  const next: TryToFixLock = { agentId, fingerprint, at: Date.now() };
  window.sessionStorage.setItem(TRY_TO_FIX_LOCK_KEY, JSON.stringify(next));
  return true;
}

/** Release the lock after a failed send so the user can retry. */
export function releaseTryToFix(agentId: string): void {
  if (typeof window === "undefined") return;
  const existing = readTryToFixLock();
  if (existing && existing.agentId === agentId) {
    window.sessionStorage.removeItem(TRY_TO_FIX_LOCK_KEY);
  }
}
