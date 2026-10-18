export type PreviewTool = "research" | "documents" | "writing" | "analysis";

/** Local suggestions only: this never creates a spec, connection or execution. */
export function suggestPreviewTool(idea: string): PreviewTool {
  const text = idea.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/recherch|research|veille|competitor|source|web/.test(text)) return "research";
  if (/document|pdf|note|reunion|meeting|compte rendu/.test(text)) return "documents";
  if (/redig|writ|article|email|contenu|content/.test(text)) return "writing";
  return "analysis";
}

export const PREVIEW_DURATION_MS = 50_000;
export function previewProgress(startedAt: number, now: number): number {
  return Math.min(1, Math.max(0, (now - startedAt) / PREVIEW_DURATION_MS));
}
