/**
 * Each build step speaks once, not twice.
 *
 * A live build showed "Outils confirmés. Construction en cours." immediately
 * followed by "Outils verrouillés. Je construis votre agent." — two bubbles,
 * one second apart, saying the same thing. `formClosed` is the receipt printed
 * on the form you just submitted; `saved` is the assistant's next line. They
 * are two different jobs, so they must not both announce the build.
 */

import { describe, expect, it } from "vitest";

import enBuilder from "@/locales/en/builder.json";
import frBuilder from "@/locales/fr/builder.json";

// Some bundle sections nest a further level, so widen through `unknown` and
// read the two string fields this file cares about.
type StepBundle = Record<string, Record<string, string> | undefined>;
const LOCALES = { fr: frBuilder, en: enBuilder } as unknown as Record<
  string,
  StepBundle
>;

const PAIRED_STEPS = [
  "capabilities",
  "toolReview",
  "providers",
  "secrets",
] as const;

/** Words too common to count as an echo. */
const FILLER = new Set([
  "je", "la", "le", "les", "de", "des", "du", "votre", "vos", "et", "en", "un", "une",
  "the", "your", "a", "an", "is", "in", "it", "i'm", "i", "now", "and",
]);

function meaningfulWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[.,—:!?]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !FILLER.has(w)),
  );
}

describe.each(Object.entries(LOCALES))("%s build step messages", (_locale, bundle) => {
  it.each(PAIRED_STEPS)("%s says its piece once", (step) => {
    const section = bundle[step];
    const receipt = section?.formClosed;
    const nextLine = section?.saved;
    if (!receipt || !nextLine) return;

    const shared = [...meaningfulWords(receipt)].filter((w) =>
      meaningfulWords(nextLine).has(w),
    );
    expect(shared).toEqual([]);
  });

  it.each(PAIRED_STEPS)("%s receipt stays a receipt, not a status", (step) => {
    const receipt = bundle[step]?.formClosed;
    if (!receipt) return;

    // "Construction en cours." / "Building now." belongs to the next line.
    expect(receipt.toLowerCase()).not.toMatch(
      /construction en cours|je construis|building now|building your/,
    );
  });
});

describe.each(Object.entries(LOCALES))("%s identity card", (_locale, bundle) => {
  it("does not promise a step that may never come", () => {
    // The card always appended "connect a brain (LLM) with your API key", but
    // when a provider is already connected that step is skipped entirely and
    // the trigger form comes next — the card was announcing the wrong thing.
    const next = bundle.identity?.confirmedNext ?? "";
    expect(next.toLowerCase()).not.toMatch(/llm|api key|clé api|cerveau|brain/);
    expect(next.trim()).not.toBe("");
  });
});
