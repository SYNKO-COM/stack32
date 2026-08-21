import { describe, expect, it } from "vitest";

import { agentHasUnpublishedDraft } from "@/lib/domain/agent-publish";

describe("agentHasUnpublishedDraft", () => {
  it("is false when the agent is not published", () => {
    expect(
      agentHasUnpublishedDraft({
        status: "draft",
        draftVersionId: "v2",
        publishedVersionId: "v1",
      }),
    ).toBe(false);
  });

  it("is false when draft and published versions match", () => {
    expect(
      agentHasUnpublishedDraft({
        status: "published",
        draftVersionId: "v1",
        publishedVersionId: "v1",
      }),
    ).toBe(false);
  });

  it("is true when a published agent has a newer draft", () => {
    expect(
      agentHasUnpublishedDraft({
        status: "published",
        draftVersionId: "v2",
        publishedVersionId: "v1",
      }),
    ).toBe(true);
  });
});
