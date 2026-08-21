import type { Agent } from "@/lib/domain/types";

/** Published agents keep serving the live version while the owner edits a newer draft. */
export function agentHasUnpublishedDraft(agent?: Pick<
  Agent,
  "status" | "draftVersionId" | "publishedVersionId"
> | null): boolean {
  if (!agent || agent.status !== "published") return false;
  const draft = agent.draftVersionId;
  const published = agent.publishedVersionId;
  if (!draft || !published) return false;
  return draft !== published;
}
