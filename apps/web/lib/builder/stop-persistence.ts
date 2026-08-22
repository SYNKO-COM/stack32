/** Persist Stop so a refresh cannot revive a canceled turn. */

const BUILDER_PREFIX = "stack32:builder-stopped:";
const LIVE_PREFIX = "stack32:live-stopped:";
const STOP_TTL_MS = 6 * 60 * 60 * 1000;

export type StopRecord = {
  runId?: string | null;
  at: number;
};

/** @deprecated Prefer StopRecord */
export type BuilderStopRecord = StopRecord;

function readStop(prefix: string, agentId: string): StopRecord | null {
  if (typeof window === "undefined" || !agentId) return null;
  try {
    const raw = window.sessionStorage.getItem(`${prefix}${agentId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StopRecord;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > STOP_TTL_MS) {
      clearStop(prefix, agentId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStop(prefix: string, agentId: string, runId?: string | null): void {
  if (typeof window === "undefined" || !agentId) return;
  try {
    const payload: StopRecord = { runId: runId ?? null, at: Date.now() };
    window.sessionStorage.setItem(`${prefix}${agentId}`, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

function clearStop(prefix: string, agentId: string): void {
  if (typeof window === "undefined" || !agentId) return;
  try {
    window.sessionStorage.removeItem(`${prefix}${agentId}`);
  } catch {
    /* ignore */
  }
}

export function readBuilderStop(agentId: string): StopRecord | null {
  return readStop(BUILDER_PREFIX, agentId);
}

export function writeBuilderStop(agentId: string, runId?: string | null): void {
  writeStop(BUILDER_PREFIX, agentId, runId);
}

export function clearBuilderStop(agentId: string): void {
  clearStop(BUILDER_PREFIX, agentId);
}

export function readLiveStop(agentId: string): StopRecord | null {
  return readStop(LIVE_PREFIX, agentId);
}

export function writeLiveStop(agentId: string, runId?: string | null): void {
  writeStop(LIVE_PREFIX, agentId, runId);
}

export function clearLiveStop(agentId: string): void {
  clearStop(LIVE_PREFIX, agentId);
}
