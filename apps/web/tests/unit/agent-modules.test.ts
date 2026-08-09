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
