/** Persist composer text across tab switches / remounts (session only). */

const PREFIX = "stack32:composer-draft:";

export function readComposerDraft(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(`${PREFIX}${key}`) ?? "";
  } catch {
    return "";
  }
}

export function writeComposerDraft(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = value.trim();
    if (!trimmed) {
      window.sessionStorage.removeItem(`${PREFIX}${key}`);
      return;
    }
    window.sessionStorage.setItem(`${PREFIX}${key}`, value);
  } catch {
    // sessionStorage unavailable — draft is simply not restored.
  }
}
