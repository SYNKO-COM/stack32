import { describe, expect, it } from "vitest";

import { buildProductAgentGraph } from "@/components/builder/agent-structure/graph-adapter";
import { groupToolsByApp } from "@/lib/integrations/app-grouping";
import { reduceExecutionEvents } from "@/lib/domain/execution-state";
import { normalizeRuntimeError } from "@/lib/domain/runtime-errors";
import { estimateCanvasHeight } from "@/components/builder/agent-structure/product-graph-layout";
import type { AgentSpec } from "@/lib/domain/types";

function baseSpec(tools: AgentSpec["tools"]): AgentSpec {
  return {
    schemaVersion: "4.0",
    name: "T",
    slug: "t",
    goal: "g",
    instructions: "s",
    modelProfile: { profile: "standard", temperature: 0.2 },
    tools,
    toolBindings: tools.map((t) => ({
      toolId: t.tool,
      provider: t.tool.startsWith("gmail") ? "google" : "native",
      enabled: t.enabled,
    })),
    knowledge: { enabled: false, sourceIds: [] },
    memory: { conversationWindow: 10, conversationEnabled: true, semanticEnabled: false },
    rules: [],
    output: { format: "markdown", allowTables: true },
    starterPrompts: [],
    runtime: { maxSteps: 8, timeoutSeconds: 120, maxToolCalls: 5 },
    triggers: [{ kind: "chat", enabled: true }],
    identity: { name: "Test Agent", role: "Assistant" },
  } as unknown as AgentSpec;
}

describe("app-grouping", () => {
  it("groups four gmail tools into one node", () => {
    const groups = groupToolsByApp(
      ["gmail_list", "gmail_read", "gmail_create_draft", "gmail_send_message"],
      new Map(),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.appKey).toBe("gmail");
    expect(groups[0]?.toolIds).toHaveLength(4);
  });

  it("keeps Gmail, Calendar, Docs and Sheets as independent apps", () => {
    const bindings = new Map(
      [
        "gmail_list",
        "calendar_list",
        "google_docs_create",
        "pd:google_sheets-add-single-row",
      ].map((toolId) => [
        toolId,
        { toolId, provider: "google", appId: "google", enabled: true },
      ]),
    );
    const groups = groupToolsByApp([...bindings.keys()], bindings);
    expect(groups.map((g) => g.appKey).sort()).toEqual([
      "gmail",
      "google_calendar",
      "google_docs",
      "google_sheets",
    ]);
  });

  it("does not treat a Google suite connection as covering Calendar", () => {
    const graph = buildProductAgentGraph({
      definition: baseSpec([
        { tool: "gmail_list", enabled: true },
        { tool: "calendar_list", enabled: true },
      ]),
      boundToolIds: new Set(["gmail_list"]),
      boundProviders: new Set(["google"]),
      boundAppIds: new Set(["gmail"]),
    });
    const gmail = graph.nodes.find((n) => n.id === "app:gmail");
    const calendar = graph.nodes.find((n) => n.id === "app:google_calendar");
    expect(gmail?.configurationStatus).toBe("ready");
    expect(calendar?.configurationStatus).toBe("setup_required");
  });

  it("requires the product app id — tool bindings alone are not enough", () => {
    const graph = buildProductAgentGraph({
      definition: baseSpec([{ tool: "calendar_list", enabled: true }]),
      boundToolIds: new Set(["calendar_list"]),
      boundProviders: new Set(["google", "pipedream"]),
    });
    const calendar = graph.nodes.find((n) => n.id === "app:google_calendar");
    expect(calendar?.configurationStatus).toBe("setup_required");
  });

  it("does not collapse distinct Pipedream apps into one node", () => {
    const bindings = new Map(
      ["pd:slack-send-message", "pd:hubspot-create-contact"].map((toolId) => [
        toolId,
        { toolId, provider: "pipedream", appId: "pipedream", enabled: true },
      ]),
    );
    const groups = groupToolsByApp([...bindings.keys()], bindings);
    expect(groups.map((g) => g.appKey).sort()).toEqual(["hubspot", "slack"]);
  });

  it("labels google_maps_platform as Google Maps", () => {
    const bindings = new Map([
      [
        "pd:google_maps_platform-search-places",
        {
          toolId: "pd:google_maps_platform-search-places",
          provider: "pipedream",
          appId: "google_maps_platform",
          enabled: true,
        },
      ],
    ]);
    const groups = groupToolsByApp([...bindings.keys()], bindings);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.appKey).toBe("google_maps_platform");
    expect(groups[0]?.appName).toBe("Google Maps");
  });
});

describe("graph-adapter", () => {
  it("drawer receives all actions for Gmail", () => {
    const graph = buildProductAgentGraph({
      definition: baseSpec([
        { tool: "gmail_list", enabled: true },
        { tool: "gmail_read", enabled: true },
        { tool: "gmail_send_message", enabled: true },
      ]),
    });
    const gmail = graph.nodes.find((n) => n.kind === "integration");
    expect(gmail?.integration?.actions).toHaveLength(3);
  });

  it("renders a tool event trigger node", () => {
    const spec = baseSpec([]);
    spec.triggers = [
      { kind: "chat", enabled: true },
      {
        kind: "tool",
        enabled: true,
        appId: "gmail",
        componentId: "gmail-new-email",
        label: "New email",
      },
    ];
    const graph = buildProductAgentGraph({
      definition: spec,
      boundAppIds: new Set(["gmail"]),
    });
    const tool = graph.nodes.find((n) => n.kind === "trigger_tool");
    expect(tool?.label).toBe("New email");
    expect(tool?.configurationStatus).toBe("ready");
    expect(graph.edges.some((e) => e.source === "trigger:tool" && e.target === "agent")).toBe(
      true,
    );
  });

  it("keeps the agent portrait node without a description", () => {
    const graph = buildProductAgentGraph({ definition: baseSpec([]) });
    const agent = graph.nodes.find((n) => n.kind === "agent");
    expect(agent?.label).toBe("AI Agent");
    expect(agent?.agentName).toBe("Test Agent");
    expect(agent?.subtitle).toBeUndefined();
  });

  it("connects tools to a shared agent-tools handle with dashed edges", () => {
    const graph = buildProductAgentGraph({
      definition: baseSpec([{ tool: "gmail_send_message", enabled: true }]),
    });
    const toolEdge = graph.edges.find((e) => e.source === "app:gmail");
    expect(toolEdge?.style).toBe("dashed");
    expect(toolEdge?.targetHandle).toBe("agent-tools");
    expect(toolEdge?.sourceHandle).toBe("out");
  });
});

describe("product-graph-layout", () => {
  it("scales height for many integrations", () => {
    expect(estimateCanvasHeight(1)).toBeLessThan(estimateCanvasHeight(10));
  });
});

describe("execution-state", () => {
  it("aggregates tool events by app node", () => {
    const graph = buildProductAgentGraph({
      definition: baseSpec([{ tool: "gmail_send_message", enabled: true }]),
    });
    const visual = reduceExecutionEvents(
      [
        { eventType: "runtime.input.received" },
        { eventType: "runtime.tool.started", toolId: "gmail_send_message" },
        { eventType: "runtime.tool.completed", toolId: "gmail_send_message" },
        { eventType: "runtime.output.completed" },
        { eventType: "run.completed" },
      ],
      graph,
    );
    expect(visual.nodes["app:gmail"]?.executionStatus).toBe("success");
  });

  it("keeps agent running until run.completed", () => {
    const visual = reduceExecutionEvents([
      { eventType: "runtime.input.received" },
      { eventType: "runtime.model.completed" },
    ]);
    expect(visual.nodes.agent?.executionStatus).toBe("running");
    const done = reduceExecutionEvents([
      { eventType: "runtime.input.received" },
      { eventType: "runtime.output.completed" },
      { eventType: "run.completed" },
    ]);
    expect(done.nodes.agent?.executionStatus).toBe("success");
  });
});

describe("runtime-errors", () => {
  it("normalizes connection required", () => {
    const err = normalizeRuntimeError("CONNECTION_REQUIRED");
    expect(err.fixAction).toBe("connect");
  });
});
