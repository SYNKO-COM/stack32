import { describe, expect, it, vi } from "vitest";

import { createOwnedAgentBriefDraft } from "@/lib/marketplace/brief-draft";

type Client = Parameters<typeof createOwnedAgentBriefDraft>[0];
const spec = {
  identity: { name: "QA", role: "Test", tone: "concise" },
  goal: "Calculate", instructions: { system: "Old", prohibited_actions: ["Expose secrets"] },
  rules: [{ id: "old", text: "Only public data" }],
  model: { model_id: "existing-model" }, tools: [{ tool_id: "calculator" }],
};
const fields = { name: "QA", role: "Test", goal: "Calculate", instructions: "New", rules: ["Only public data"] };

function fakeDatabase(fail = false) {
  const eq = vi.fn();
  const insert = vi.fn();
  const reads = [{ spec, graph_spec: { nodes: [] }, schema_compat: "v2" }, { version_number: 7 }];
  const chain = {
    select: vi.fn(() => chain),
    eq: eq.mockImplementation(() => chain),
    order: vi.fn(() => chain), limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: reads.shift(), error: null })),
    insert: insert.mockImplementation(() => chain),
    single: vi.fn(async () => ({ data: fail ? null : { id: "new-draft" }, error: fail ? new Error("conflict") : null })),
  };
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as Client, from, eq, insert };
}

describe("Settings respects immutable agent versions", () => {
  it("creates a new draft and keeps model, tools and prohibitions", async () => {
    const db = fakeDatabase();
    expect(await createOwnedAgentBriefDraft(db.client, { id: "qa", draft_version_id: "old-draft", published_version_id: "published" }, "owner", fields)).toBe("new-draft");
    expect(db.eq).toHaveBeenCalledWith("id", "old-draft");
    expect(db.eq).not.toHaveBeenCalledWith("id", "published");
    const saved = db.insert.mock.calls[0][0];
    expect(saved).toMatchObject({ agent_id: "qa", created_by: "owner", version_number: 8, test_status: "not_run", validation_status: "pending" });
    expect(saved.spec).toMatchObject({ tools: spec.tools, model: spec.model, instructions: { system: "New", prohibited_actions: ["Expose secrets"] } });
    expect(saved.spec.rules).toEqual([{ id: "settings_1", text: "Only public data", priority: 100 }]);
    expect(spec.instructions.system).toBe("Old");
  });

  it("fails instead of claiming success when draft creation is refused", async () => {
    const db = fakeDatabase(true);
    await expect(createOwnedAgentBriefDraft(db.client, { id: "qa", draft_version_id: "old-draft" }, "owner", fields)).rejects.toThrow("conflict");
  });
});
