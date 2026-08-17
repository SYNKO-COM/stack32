import { describe, expect, it } from "vitest";

import {
  mapBuilderMessage,
  mapLiveMessage,
  specFromDb,
  specToDb,
} from "@/lib/domain/mappers";
import { makeSpecForPrompt } from "@/lib/repositories/mock/seed";
import type { Database } from "@/lib/supabase/database.types";

type BuilderMessageRow = Database["public"]["Tables"]["builder_messages"]["Row"];
type LiveMessageRow = Database["public"]["Tables"]["live_messages"]["Row"];

describe("AgentSpec mappers", () => {
  it("round-trips a domain spec through the DB skeleton shape", () => {
    const original = makeSpecForPrompt("Sales Agent", "Research leads for me");
    const db = specToDb(original);
    const restored = specFromDb(db);

    expect(restored.name).toBe(original.name);
    expect(restored.goal).toBe(original.goal);
    expect(restored.instructions).toBe(original.instructions);
    expect(restored.tools).toEqual(original.tools);
    expect(restored.knowledge).toEqual(original.knowledge);
    expect(restored.starterPrompts).toEqual(original.starterPrompts);
    expect(restored.runtime).toEqual(original.runtime);
  });

  it("maps the Phase 2 DB skeleton to a renderable domain spec", () => {
    const skeleton = {
      schema_version: "1.0",
      name: "Support Agent",
      goal: "Answer customer questions",
      instructions: { system: "Be helpful", tone: "professional", language: "auto" },
      model_profile: "balanced",
      input: { channels: ["chat"], attachments: [] },
      tools: [],
      knowledge: { source_ids: [], retrieval_enabled: false },
      memory: { conversation: true, semantic: false },
      rules: [],
      output: { format: "markdown", schema: null },
      starter_prompts: [],
      runtime: { max_steps: 8, timeout_seconds: 60, max_tool_calls: 6 },
    };

    const spec = specFromDb(skeleton);
    expect(spec.name).toBe("Support Agent");
    expect(spec.goal).toBe("Answer customer questions");
    expect(spec.instructions).toBe("Be helpful");
    expect(spec.modelProfile.profile).toBe("standard");
    expect(spec.output.format).toBe("markdown");
    expect(spec.knowledge.enabled).toBe(false);
  });

  it("tolerates unknown/empty specs without crashing", () => {
    const spec = specFromDb({}, "Fallback name");
    expect(spec.name).toBe("Fallback name");
    expect(spec.tools).toEqual([]);
    expect(spec.runtime.maxSteps).toBe(8);
  });
});

function builderRow(overrides: Partial<BuilderMessageRow>): BuilderMessageRow {
  return {
    id: "m1",
    thread_id: "t1",
    agent_id: "a1",
    user_id: "u1",
    role: "user",
    content: "hello",
    metadata: {},
    run_id: null,
    created_at: "2026-08-04T10:00:00Z",
    ...overrides,
  };
}

describe("message mappers", () => {
  it("maps builder metadata (steps, tone, actions)", () => {
    const mapped = mapBuilderMessage(
      builderRow({
        role: "assistant",
        content: "builder:mock.successResponse",
        metadata: {
          steps: [{ labelKey: "understanding", state: "done" }],
          tone: "success",
          actions: ["test_agent"],
        },
      }),
    );
    expect(mapped).not.toBeNull();
    expect(mapped?.steps?.[0].labelKey).toBe("understanding");
    expect(mapped?.tone).toBe("success");
    expect(mapped?.actions).toEqual(["test_agent"]);
  });

    it("maps builder ui_component identity form metadata", () => {
    const mapped = mapBuilderMessage(
      builderRow({
        role: "assistant",
        content: "builder:identity.prompt",
        metadata: {
          ui_component: {
            type: "agent_identity_form",
            version: "1",
            request_id: "run-123",
            fields: [
              { key: "name", type: "text", required: true, suggested_value: "Sales Bot" },
            ],
          },
          interrupt_run_id: "run-123",
        },
      }),
    );
    expect(mapped?.uiComponent?.type).toBe("agent_identity_form");
    expect(mapped?.uiComponent?.requestId).toBe("run-123");
    expect(mapped?.interruptRunId).toBe("run-123");
  });

  it("maps secret_form and playReadySound metadata", () => {
    const mapped = mapBuilderMessage(
      builderRow({
        role: "assistant",
        content: "builder:secrets.prompt",
        metadata: {
          ui_component: {
            type: "secret_form",
            version: "1",
            request_id: "run-456",
            context: "builder",
            fields: [
              { key: "api_key", type: "secret", required: true },
            ],
          },
          interrupt_run_id: "run-456",
          playReadySound: true,
        },
      }),
    );
    expect(mapped?.uiComponent?.type).toBe("secret_form");
    expect(mapped?.uiComponent?.context).toBe("builder");
    expect(mapped?.playReadySound).toBe(true);
  });

  it("maps connection_form and approval_form ui components", () => {
    const connection = mapBuilderMessage(
      builderRow({
        role: "assistant",
        content: "Connect Google",
        metadata: {
          ui_component: {
            type: "connection_form",
            version: "1",
            request_id: "run-conn",
            fields: [
              { key: "provider", type: "text", required: true, suggested_value: "google" },
            ],
          },
        },
      }),
    );
    expect(connection?.uiComponent?.type).toBe("connection_form");

    const approval = mapBuilderMessage(
      builderRow({
        role: "assistant",
        content: "Approve tool",
        metadata: {
          ui_component: {
            type: "approval_form",
            version: "1",
            request_id: "run-appr",
            fields: [
              { key: "tool_id", type: "text", required: true, suggested_value: "gmail_send_message" },
              { key: "approval_mode", type: "text", required: false, suggested_value: "always" },
            ],
          },
        },
      }),
    );
    expect(approval?.uiComponent?.type).toBe("approval_form");
  });

  it("maps provider_clarification_form so the user can pick the exact app", () => {
    const mapped = mapBuilderMessage(
      builderRow({
        role: "assistant",
        content: "builder:providers.prompt",
        metadata: {
          ui_component: {
            type: "provider_clarification_form",
            version: "1",
            request_id: "run-prov",
            context: "builder",
            fields: [
              {
                key: "app_google_maps",
                type: "select",
                required: true,
                label: "Which app did you mean by “google maps”?",
                options: ["google_maps", "google_sheets"],
                suggested_value: "google_maps",
              },
              { key: "tool_website", type: "text", required: false },
            ],
          },
          interrupt_run_id: "run-prov",
        },
      }),
    );
    expect(mapped?.uiComponent?.type).toBe("provider_clarification_form");
    expect(mapped?.uiComponent?.fields[0]?.options).toEqual(["google_maps", "google_sheets"]);
    expect(mapped?.interruptRunId).toBe("run-prov");
  });

  it("maps V4 tool bindings loosely", () => {
    const spec = specFromDb({
      schema_version: "4.0",
      identity: { name: "Hybrid", role: "Assistant" },
      goal: "Connect apps",
      instructions: { system: "Help." },
      model_policy: { profile: "balanced" },
      tools: [
        {
          tool_id: "gmail_list",
          provider: "native",
          enabled: true,
          approval_mode: "always",
        },
        {
          tool_id: "pd:slack-send-message",
          provider: "pipedream",
          app_id: "slack",
          approval_mode: "conditional",
        },
      ],
      knowledge: {},
      memory: {},
      output: {},
      runtime: {},
    });
    expect(spec.tools.map((t) => t.tool)).toEqual(["gmail_list", "pd:slack-send-message"]);
    expect(spec.toolBindings?.[0]?.approvalMode).toBe("always");
    expect(spec.toolBindings?.[1]?.provider).toBe("pipedream");
    expect(spec.toolBindings?.[1]?.appId).toBe("slack");
  });

  it("filters out system/tool roles the UI does not render", () => {
    expect(mapBuilderMessage(builderRow({ role: "system" }))).toBeNull();
    expect(mapBuilderMessage(builderRow({ role: "tool" }))).toBeNull();
  });

  it("maps live pending state from metadata", () => {
    const row: LiveMessageRow = {
      id: "m2",
      thread_id: "t2",
      agent_id: "a1",
      user_id: "u1",
      installation_id: null,
      role: "assistant",
      content: "",
      artifacts: [],
      citations: [],
      metadata: { pending: true, statusKey: "searching" },
      run_id: null,
      created_at: "2026-08-04T10:00:00Z",
    };
    const mapped = mapLiveMessage(row);
    expect(mapped?.pending).toBe(true);
    expect(mapped?.statusKey).toBe("searching");
  });
});
