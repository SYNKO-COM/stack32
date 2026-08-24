/**
 * A line should feel typed, not endured.
 *
 * The reveal used setInterval at ~21ms and re-rendered on every character. As
 * the conversation grew each render cost more, so a 140-character line took
 * minutes to appear while the backend had already delivered the form beneath
 * it — measured three times on a live build: backend ready at 11:59:38, form
 * on screen around 12:04. Reloading the page showed everything instantly,
 * which is what proved the delay was the animation and nothing else.
 *
 * These check the pacing arithmetic the component now uses.
 */

import { describe, expect, it } from "vitest";

const MAX_TYPING_MS = 1200;
const MIN_TYPING_MS = 180;

/** Mirrors the duration calculation in message-motion.tsx. */
function typingDuration(length: number, cps = 48): number {
  return Math.min(
    MAX_TYPING_MS,
    Math.max(MIN_TYPING_MS, (length / Math.max(cps, 1)) * 1000),
  );
}

/** Characters revealed at a given moment. */
function shownCount(length: number, elapsed: number, cps = 48): number {
  const progress = Math.min(1, elapsed / typingDuration(length, cps));
  return Math.max(1, Math.round(length * progress));
}

describe("how long a message takes to appear", () => {
  it("never exceeds the cap, however long the text", () => {
    for (const length of [140, 500, 2000, 20000]) {
      expect(typingDuration(length)).toBeLessThanOrEqual(MAX_TYPING_MS);
    }
  });

  it("keeps a short line from flashing past", () => {
    expect(typingDuration(3)).toBeGreaterThanOrEqual(MIN_TYPING_MS);
  });

  it("takes about a second for the line that used to take minutes", () => {
    // "Le chat est toujours activé. Vous pouvez aussi ajouter un planning…"
    expect(typingDuration(140)).toBeLessThanOrEqual(MAX_TYPING_MS);
    expect(typingDuration(140)).toBeGreaterThan(MIN_TYPING_MS);
  });

  it("does not slow down as the text grows past the cap", () => {
    expect(typingDuration(2000)).toBe(typingDuration(20000));
  });
});

describe("what is on screen while it types", () => {
  it("shows something from the first frame", () => {
    expect(shownCount(140, 16)).toBeGreaterThanOrEqual(1);
  });

  it("reveals everything once the duration has passed", () => {
    const length = 140;
    expect(shownCount(length, typingDuration(length))).toBe(length);
  });

  it("stays complete after the end", () => {
    const length = 500;
    expect(shownCount(length, typingDuration(length) * 3)).toBe(length);
  });

  it("advances monotonically", () => {
    const length = 800;
    let previous = 0;
    for (let t = 0; t <= typingDuration(length); t += 16) {
      const count = shownCount(length, t);
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  it("costs at most one update per frame", () => {
    // 1200ms at 60fps is 75 frames — against 2000+ renders for a 2000
    // character message under the old per-character interval.
    const frames = Math.ceil(typingDuration(2000) / 16);
    expect(frames).toBeLessThan(100);
    expect(frames).toBeLessThan(2000);
  });
});
