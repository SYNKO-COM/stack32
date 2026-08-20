import { describe, expect, it } from "vitest";

import { clampReviewRating, eurosToCents, shuffleArray } from "@/lib/marketplace/shuffle";

function makeRandom(start = 0.1, step = 0.27) {
  let seed = start;
  return () => {
    seed = (seed + step) % 1;
    return seed;
  };
}

describe("shuffleArray", () => {
  it("keeps the same items without mutating the source", () => {
    const items = ["a", "b", "c", "d"];
    const shuffled = shuffleArray(items, () => 0.2);
    expect([...shuffled].sort()).toEqual([...items]);
    expect(shuffled).not.toBe(items);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("is deterministic with the same random sequence", () => {
    expect(shuffleArray([1, 2, 3, 4, 5], makeRandom())).toEqual(
      shuffleArray([1, 2, 3, 4, 5], makeRandom()),
    );
  });

  it("changes order for a non-identity random", () => {
    const items = [1, 2, 3, 4, 5, 6];
    let i = 0;
    const values = [0.9, 0.1, 0.8, 0.2, 0.7, 0.3];
    const shuffled = shuffleArray(items, () => values[i++] ?? 0);
    expect(shuffled).not.toEqual(items);
  });
});

describe("clampReviewRating", () => {
  it("accepts 1 through 5", () => {
    expect(clampReviewRating(1)).toBe(1);
    expect(clampReviewRating(5)).toBe(5);
  });

  it("rejects non-integers and out of range", () => {
    expect(clampReviewRating(0)).toBeNull();
    expect(clampReviewRating(6)).toBeNull();
    expect(clampReviewRating(3.5)).toBeNull();
    expect(clampReviewRating(Number.NaN)).toBeNull();
  });
});

describe("eurosToCents", () => {
  it("rounds to the nearest cent", () => {
    expect(eurosToCents(0)).toBe(0);
    expect(eurosToCents(9.99)).toBe(999);
    expect(eurosToCents(10)).toBe(1000);
    expect(eurosToCents(-4)).toBe(0);
  });
});
