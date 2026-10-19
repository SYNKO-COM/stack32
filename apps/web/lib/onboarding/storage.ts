import { journeySchema, type Journey } from "./journey";

const PREFIX = "stack32.mobileJourney.v3.";
const CLAIM = "stack32.mobileJourney.claim";
export type LocalJourney = { id: string; owner: string | null; state: Journey };
export function newJourney(prompt = ""): LocalJourney {
  return { id: crypto.randomUUID(), owner: null, state: { version: 3, step: "welcome", initialPrompt: prompt.slice(0, 4000), answers: { "b.idea": prompt.slice(0, 4000), "b.target": 1000 }, updatedAt: Date.now() } };
}
export function readJourney(owner: string | null): LocalJourney | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFIX + (owner ?? "guest")) ?? "null") as LocalJourney | null;
    if (!parsed || parsed.owner !== owner || !/^[\da-f-]{36}$/i.test(parsed.id)) return null;
    return { ...parsed, state: journeySchema.parse(parsed.state) };
  } catch { return null; }
}
export function writeJourney(draft: LocalJourney) {
  try { localStorage.setItem(PREFIX + (draft.owner ?? "guest"), JSON.stringify(draft)); } catch { /* UI remains usable; server save reports errors after auth. */ }
}
export function captureMobilePrompt(prompt: string) {
  const draft = readJourney(null) ?? newJourney(prompt);
  // Starting a new prompt is explicit; never overwrite an edited idea on a resume.
  if (draft.state.step === "welcome") {
    draft.state.initialPrompt = prompt.slice(0, 4000);
    draft.state.answers["b.idea"] = prompt.slice(0, 4000);
  }
  writeJourney(draft);
}
export function markJourneyClaim(id: string) { try { sessionStorage.setItem(CLAIM, id); } catch { /* OAuth still returns to checkpoint. */ } }
export function claimableJourney(): LocalJourney | null {
  try {
    const guest = readJourney(null);
    return guest && sessionStorage.getItem(CLAIM) === guest.id ? guest : null;
  } catch { return null; }
}
export function completeJourneyClaim(owner: string, draft: LocalJourney) {
  writeJourney({ ...draft, owner });
  try { localStorage.removeItem(PREFIX + "guest"); sessionStorage.removeItem(CLAIM); } catch { /* ignore */ }
}

export function clearAnonymousJourney() {
  try {
    localStorage.removeItem(PREFIX + "guest");
    sessionStorage.removeItem(CLAIM);
    sessionStorage.removeItem("stack32.pendingPrompt");
  } catch { /* private mode */ }
}
