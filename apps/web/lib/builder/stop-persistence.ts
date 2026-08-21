/** Persist Builder Stop so a refresh cannot revive a canceled turn. */

const PREFIX = "stack32:builder-stopped:";

export type BuilderStopRecord = {
  runId?: string | null;
  at: number;
};

export function readBuilderStop(agentId: string): BuilderStopRecord | null {
  if (typeof window === "undefined" || !agentId) return null;
  try {
    const raw = window.sessionStorage.getItem(`${PREFIX}${agentId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuilderStopRecord;
    if (!parsed || typeof parsed.at !== "number") return null;
    // Ignore stale flags from a previous day in the same tab.
    if (Date.now() - parsed.at > 6 * 60 * 60 * 1000) {
      clearBuilderStop(agentId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeBuilderStop(agentId: string, runId?: string | null): void {
  if (typeof window === "undefined" || !agentId) return;
  try {
    const payload: BuilderStopRecord = { runId: runId ?? null, at: Date.now() };
    window.sessionStorage.setItem(`${PREFIX}${agentId}`, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function clearBuilderStop(agentId: string): void {
  if (typeof window === "undefined" || !agentId) return;
  try {
    window.sessionStorage.removeItem(`${PREFIX}${agentId}`);
  } catch {
    /* ignore */
  }
}
