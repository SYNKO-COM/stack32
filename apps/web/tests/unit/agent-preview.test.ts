import { describe, expect, it } from "vitest";
import { previewProgress, suggestPreviewTool } from "@/lib/agent-preview";
import { OFFERED_PLAN_KEYS, PLANS } from "@/lib/billing/plans";

describe("local agent preview", () => {
  it("suggests modules from the brief without executing anything", () => {
    expect(suggestPreviewTool("Recherche concurrentielle")).toBe("research");
    expect(suggestPreviewTool("Notes de réunion")).toBe("documents");
    expect(suggestPreviewTool("Rédiger un article")).toBe("writing");
    expect(suggestPreviewTool("Organiser mon projet")).toBe("analysis");
  });
  it("resumes elapsed progress and completes at 50 seconds", () => {
    expect(previewProgress(1000, 0)).toBe(0);
    expect(previewProgress(1000, 26000)).toBe(0.5);
    expect(previewProgress(1000, 51000)).toBe(1);
    expect(previewProgress(1000, 91000)).toBe(1);
  });
  it("offers only paid plans but retains the legacy free entitlement definition", () => {
    expect(OFFERED_PLAN_KEYS).toEqual(["starter", "pro", "scale"]);
    expect(PLANS.free).toBeDefined();
  });
});
