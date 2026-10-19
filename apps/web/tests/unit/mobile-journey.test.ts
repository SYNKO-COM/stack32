import { describe, expect, it } from "vitest";
import { canContinue, difficulty, guidedBrief, monthlySales, pathFor, PRICE_CATEGORIES, referencePrice, resolveBrief, STEPS, TARGETS, timeProjection, toggleSector, type Journey } from "@/lib/onboarding/journey";
import { classifyDevice } from "@/lib/onboarding/device";
import { requestLocale } from "@/lib/i18n/locales";
import { onboardingPathForNext, safeNextPath } from "@/lib/auth/post-auth";

const draft = (answers: Journey["answers"], initialPrompt = "Original prompt"): Journey => ({ version: 3, step: "goal", initialPrompt, answers, updatedAt: 1 });
const business = { goal: STEPS.goal.options![0] };
const automation = { goal: STEPS.goal.options![2] };
describe("validated mobile/tablet journey", () => {
  it("shares B for both business objectives, never adds its questions to A", () => {
    expect(pathFor(business)).toEqual(pathFor({ goal: STEPS.goal.options![1] }));
    expect(pathFor(automation).some(id => id.startsWith("b."))).toBe(false);
    expect(pathFor(automation).indexOf("a.experience")).toBeGreaterThan(pathFor(automation).indexOf("a.activity"));
  });
  it("routes beginners and experienced users through their information and all three common screens", () => {
    for (const experience of STEPS["b.experience"].options!) {
      const path = pathFor({ ...business, "b.experience": experience });
      expect(path).toContain(experience.startsWith("Oui") ? "b.experienced" : "b.beginner");
      expect(path).toEqual(expect.arrayContaining(["b.business", "b.describe", "b.configure", "b.present", "account", "b.projection"]));
      expect(path.indexOf("account")).toBe(path.indexOf("b.present") + 1);
    }
    expect(pathFor(automation).indexOf("account")).toBe(pathFor(automation).indexOf("a.explain") + 1);
  });
  it("only adds complexity information in the matching A branch", () => {
    expect(pathFor({ ...automation, "a.blocker": "Trop compliqué, pas les compétences" })).toContain("a.complexity");
    expect(pathFor(automation)).not.toContain("a.complexity");
  });
  it("keeps every free-text answer optional and requires choices", () => {
    for (const s of Object.values(STEPS)) {
      if (s.type === "text") expect(canContinue(s, {})).toBe(true);
      if (s.type === "choice" || s.type === "multi") expect(canContinue(s, {})).toBe(false);
    }
    expect(toggleSector(["Commerce", "Services"], "Je n'ai pas de préférence")).toEqual(["Je n'ai pas de préférence"]);
    expect(toggleSector(["Je n'ai pas de préférence"], "Commerce")).toEqual(["Commerce"]);
  });
  it("uses all 191 precise gauge values and explicit time-sensitive difficulty thresholds", () => {
    expect(TARGETS).toHaveLength(191); expect(new Set(TARGETS).size).toBe(191);
    expect(TARGETS.slice(89, 93)).toEqual([9900, 10000, 10500, 11000]);
    expect(TARGETS[0]).toBe(1000); expect(TARGETS[190]).toBe(60000);
    expect(difficulty({ "b.target": 10000, "b.time": "Moins de 2 h" })).toBe("Très ambitieux");
    expect(difficulty({ "b.target": 10000, "b.time": "Plus de 10 h" })).toBe("Réaliste");
  });
  it("preserves the four intentional price categories and handles zero/open-ended prices", () => {
    expect(PRICE_CATEGORIES).toEqual(["Entre 0 et 500 €", "Entre 500 et 1 000 €", "Entre 1 500 et 3 000 €", "Plus de 3 000 €"]);
    expect(monthlySales({ "b.target": 3000, "b.price": PRICE_CATEGORIES[0], "b.referencePrice": 500 })).toBe(6);
    expect(monthlySales({ "b.target": 3000, "b.price": PRICE_CATEGORIES[0], "b.referencePrice": 0 })).toBeNull();
    expect(referencePrice({ "b.price": PRICE_CATEGORIES[3], "b.referencePrice": 99000 })).toBe(99000);
  });
  it("keeps the edited idea and guided choice authoritative over the initial prompt", () => {
    const edited = draft({ ...business, "b.hasIdea": "Oui", "b.idea": "Edited mission" });
    expect(resolveBrief(edited)).toContain("Edited mission"); expect(resolveBrief(edited)).not.toContain("Original prompt");
    const guided = draft({ ...business, "b.hasIdea": "Non, aide-moi à choisir", "b.idea": "Old idea", "b.guided": "Production de contenu" });
    expect(resolveBrief(guided)).toContain("Transformer un brief"); expect(resolveBrief(guided)).not.toContain("Old idea");
    expect(pathFor({ ...business, "b.hasIdea": "Oui", "b.idea": "" })).toContain("b.guided");
    expect(pathFor(edited.answers)).not.toContain("b.guided");
    expect(guidedBrief({})).toContain("demande client");
  });
  it("filters inactive branch answers, retains the incoming A context, and does not invent time precision", () => {
    const text = resolveBrief(draft({ ...automation, "a.request": "Summarize invoices", "a.control": "Avant chaque envoi", "b.client": "SECRET INACTIVE ANSWER" }));
    expect(text).toContain("Original prompt"); expect(text).toContain("Avant chaque envoi"); expect(text).not.toContain("SECRET INACTIVE ANSWER");
    expect(timeProjection({ "a.frequency": "Chaque jour", "a.duration": "Plus d'1 h" }).target).not.toMatch(/\d/);
    expect(timeProjection({ "a.frequency": "Chaque jour", "a.duration": "15 à 30 min" }).assumptions).toContain("50 %");
  });
  it("recognizes large landscape iPads, Android tablets, and keeps desktop independent of window width", () => {
    expect(classifyDevice("Mozilla Macintosh Safari", 5, true)).toBe("mobile");
    expect(classifyDevice("Android Tablet", 10, true)).toBe("mobile");
    expect(classifyDevice("Windows Chrome", 0, false)).toBe("desktop");
  });
  it("renders the first visit in its request language and retains an explicit safe mobile auth return", () => {
    expect(requestLocale(undefined, "fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(requestLocale("en", "fr-FR")).toBe("en");
    expect(requestLocale(undefined, "de-DE")).toBe("en");
    expect(onboardingPathForNext("/onboarding?experience=mobile")).toBe("/onboarding?experience=mobile");
    expect(safeNextPath("//attacker.invalid/onboarding?experience=mobile")).toBeNull();
  });
});
