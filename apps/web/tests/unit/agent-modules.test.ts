import { describe, expect, it } from "vitest";

import { buildAgentModules } from "@/lib/domain/agent-modules";
import type { AgentSpec, GraphSpec } from "@/lib/domain/types";

const baseSpec = {
  schemaVersion: "4.0",
  name: "Hybrid",
  slug: "hybrid",
  goal: "Help",
  instructions: "Be helpful",
  modelProfile: { profile: "standard" as const, temperature: 0.4 },
  tools: [
    { tool: "web_search", enabled: true },
    { tool: "gmail_list", enabled: true },
  ],
  toolBindings: [
    { toolId: "web_search", enabled: true, provider: "native" },
    {
      toolId: "gmail_list",
      enabled: true,
      provider: "native",
      approvalMode: "always" as const,
      connectionRequirementId: "req-google",
    },
  ],
  knowledge: { enabled: false, sourceIds: [] },
  memory: { conversationWindow: 12 },
  rules: [],
  output: { format: "markdown" as const, allowTables: true },
  starterPrompts: [],
  runtime: { maxSteps: 8, timeoutSeconds: 60, maxToolCalls: 6 },
} satisfies AgentSpec;

describe("buildAgentModules readiness", () => {
  it("marks connection-required tools as needs_setup without bindings", () => {
    const modules = buildAgentModules(null, baseSpec);
    const gmail = modules.attachments.find((m) => m.toolId === "gmail_list");
    expect(gmail?.setupStatus).toBe("needs_setup");
    expect(gmail?.ready).toBe(false);
    expect(gmail?.provider).toBe("google");

    const search = modules.attachments.find((m) => m.toolId === "web_search");
    expect(search?.ready).toBe(true);
    expect(search?.setupStatus).toBe("ready");
  });

  it("marks tools ready when provider is bound", () => {
    const modules = buildAgentModules(null, baseSpec, {
      boundProviders: ["google"],
    });
    const gmail = modules.attachments.find((m) => m.toolId === "gmail_list");
    expect(gmail?.ready).toBe(true);
    expect(gmail?.setupStatus).toBe("ready");
    expect(gmail?.connectionStatus).toBe("connected");
  });

  it("reads tool_id from graph node config", () => {
    const graph: GraphSpec = {
      version: "1.0",
      entryNodeId: "in",
      nodes: [
        { id: "in", type: "input", name: "Input" },
        { id: "llm", type: "llm", name: "Brain" },
        { id: "out", type: "output", name: "Output" },
        {
          id: "tool-1",
          type: "tool",
          name: "List mail",
          config: { tool_id: "gmail_list", connection_required: true },
        },
      ],
      edges: [],
    };
    const modules = buildAgentModules(graph, baseSpec);
    const gmail = modules.attachments.find((m) => m.toolId === "gmail_list");
    expect(gmail?.setupStatus).toBe("needs_setup");
  });

  it("hides internal chain kinds (guardrail/router/approval/transform)", () => {
    const graph: GraphSpec = {
      version: "1.0",
      entryNodeId: "in",
      nodes: [
        { id: "in", type: "input", name: "Trigger" },
        { id: "guard", type: "guardrail", name: "Guardrail" },
        { id: "route", type: "router", name: "Router" },
        { id: "llm", type: "llm", name: "AI Agent" },
        { id: "appr", type: "approval", name: "Approval" },
        { id: "xform", type: "transform", name: "Transform" },
        { id: "out", type: "output", name: "Output" },
      ],
      edges: [],
    };
    const modules = buildAgentModules(graph, baseSpec);
    const kinds = modules.chain.map((m) => m.kind);
    expect(kinds).toEqual(["trigger", "brain", "output"]);
  });

  it("shows the exact BYOK model instead of the profile", () => {
    const spec = {
      ...baseSpec,
      model: { provider: "openai", modelId: "gpt-4o-mini" },
    } satisfies AgentSpec;
    const modules = buildAgentModules(null, spec);
    const model = modules.attachments.find((m) => m.kind === "model");
    expect(model?.detail).toBe("openai/gpt-4o-mini");
    const brain = modules.chain.find((m) => m.kind === "brain");
    expect(brain?.detail).toBe("openai/gpt-4o-mini");
  });

  it("reflects a schedule trigger on the trigger node", () => {
    const spec = {
      ...baseSpec,
      triggers: [
        { kind: "schedule" as const, enabled: true },
        { kind: "chat" as const, enabled: false },
      ],
    } satisfies AgentSpec;
    const modules = buildAgentModules(null, spec);
    const trigger = modules.chain.find((m) => m.kind === "trigger");
    expect(trigger?.detail).toBe("schedule");
  });

  it("marks Google Docs style tools as Pipedream setup", () => {
    const spec = {
      ...baseSpec,
      tools: [{ tool: "pd:google_docs", enabled: true }],
      toolBindings: [
        {
          toolId: "pd:google_docs",
          enabled: true,
          provider: "pipedream" as const,
          connectionRequirementId: "req-pd",
        },
      ],
    } satisfies AgentSpec;
    const modules = buildAgentModules(null, spec);
    const docs = modules.attachments.find((m) => m.toolId === "pd:google_docs");
    expect(docs?.provider).toBe("pipedream");
    expect(docs?.setupStatus).toBe("needs_setup");
  });
});
