/** Shared helpers for surfacing backend failures without infinite spinners. */

const STALE_INFLIGHT_MS = 120_000;

export function isFailureMessageKey(content: string | undefined): boolean {
  if (!content) return false;
  return content.startsWith("builder:errors.") || content.startsWith("live:errors.");
}

export function isStaleInflightMessage(createdAt: string, opts?: { emptyContent?: boolean }): boolean {
  if (opts?.emptyContent === false) return false;
  return Date.now() - new Date(createdAt).getTime() > STALE_INFLIGHT_MS;
}
