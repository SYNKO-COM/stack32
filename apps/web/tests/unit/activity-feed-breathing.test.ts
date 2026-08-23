import { describe, expect, it } from "vitest";

import { breathing } from "@/components/builder/builder-activity-feed";

/**
 * The live feed holds one active step on screen for many seconds while the
 * wording stays unchanged. A slow opacity drift on that text says "still
 * working"; the settled lines behind it must keep the depth fade they already
 * animate to, or the whole list turns restless.
 */
describe("live feed breathing text", () => {
  it("breathes on the active step", () => {
    const { animate, transition } = breathing(true, false);
    expect(animate.opacity).toEqual([1, 0.55, 1]);
    expect(transition.repeat).toBe(Infinity);
  });

  it("keeps the drift slow and gentle", () => {
    const { animate, transition } = breathing(true, false);
    const values = animate.opacity as number[];
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0.5);
    expect(transition.duration).toBeGreaterThanOrEqual(1.5);
  });

  it("returns to the same opacity it started from", () => {
    const values = breathing(true, false).animate.opacity as number[];
    expect(values[0]).toBe(values[values.length - 1]);
  });

  it("leaves settled steps alone", () => {
    expect(breathing(false, false).animate).toEqual({ opacity: 1 });
    expect(breathing(undefined, false).animate).toEqual({ opacity: 1 });
  });

  it("honours reduced motion", () => {
    const { animate, transition } = breathing(true, true);
    expect(animate).toEqual({ opacity: 1 });
    expect(transition.duration).toBe(0);
  });
});
