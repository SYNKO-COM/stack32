import { describe, expect, it } from "vitest";

/**
 * The Build page cancels a run that stops producing activity, so a worker that
 * exits early cannot leave a spinner running forever. The clock was anchored on
 * the last message — but a tool-review form the user considered for ten minutes
 * leaves that timestamp ten minutes old. The instant they answered, the guard
 * lifted and the watchdog declared the just-resumed run stuck: the build died
 * one second after the user unblocked it.
 */
const STALE_MS = 150_000;

function anchorFor({
  lastMessageAt,
  formClosedAt,
}: {
  lastMessageAt: number | null;
  formClosedAt: number | null;
}) {
  return Math.max(lastMessageAt ?? 0, formClosedAt ?? 0);
}

function isStale(now: number, anchor: number) {
  return now - anchor >= STALE_MS;
}

describe("stale build watchdog", () => {
  const T0 = 1_000_000_000_000;

  it("does not cancel a run resumed from a form the user sat on", () => {
    const lastMessageAt = T0;
    const formClosedAt = T0 + 12 * 60_000; // answered twelve minutes later
    const anchor = anchorFor({ lastMessageAt, formClosedAt });
    expect(isStale(formClosedAt + 1_000, anchor)).toBe(false);
  });

  it("still catches a genuinely stuck build after the form", () => {
    const formClosedAt = T0 + 12 * 60_000;
    const anchor = anchorFor({ lastMessageAt: T0, formClosedAt });
    expect(isStale(formClosedAt + STALE_MS + 1, anchor)).toBe(true);
  });

  it("still catches a stuck build when no form was involved", () => {
    const anchor = anchorFor({ lastMessageAt: T0, formClosedAt: null });
    expect(isStale(T0 + STALE_MS + 1, anchor)).toBe(true);
  });

  it("leaves a freshly active build alone", () => {
    const anchor = anchorFor({ lastMessageAt: T0, formClosedAt: null });
    expect(isStale(T0 + 10_000, anchor)).toBe(false);
  });

  it("takes the later of the two anchors", () => {
    expect(anchorFor({ lastMessageAt: T0 + 5_000, formClosedAt: T0 })).toBe(T0 + 5_000);
    expect(anchorFor({ lastMessageAt: T0, formClosedAt: T0 + 5_000 })).toBe(T0 + 5_000);
  });
});
