import { describe, expect, it } from "vitest";

import { reduceExecutionState } from "@/hooks/use-live-execution";
import { buildAgentModules } from "@/lib/domain/agent-modules";
import { mergeOptimisticLiveChatTurn, reduceExecutionEvents } from "@/lib/domain/execution-state";
import type { ProductAgentGraph } from "@/lib/domain/product-agent-graph";
import type { AgentSpec } from "@/lib/domain/types";

function baseSpec(tools: AgentSpec["tools"]): AgentSpec {
  return {
    schemaVersion: "4.0",
    identity: { name: "T", role: "r", description: "d" },
    goal: "g",
    instructions: { system: "s" },
    rules: [],
    tools,
    toolBindings: tools.map((t) => ({
      toolId: t.tool,
      provider: t.tool.startsWith("pd:") ? "pipedream" : "native",
      enabled: t.enabled,
    })),
    connectionRequirements: [],
    knowledge: { enabled: false },
    memory: {
      conversationEnabled: true,
      conversationWindow: 10,
      semanticEnabled: false,
    },
    modelProfile: { profile: "balanced" },
    modelPolicy: { profile: "balanced", maxOutputTokens: 1024 },
    runtime: { maxToolCalls: 5 },
    approvals: { requireForSideEffects: true },
    security: { approvalRequiredForSideEffects: true },
    output: { format: "markdown" },
    graph: { nodes: [], edges: [] },
  } as unknown as AgentSpec;
}

describe("structure module filtering", () => {
  it("hides internal helpers from attachments", () => {
    const modules = buildAgentModules(
      null,
      baseSpec([
        { tool: "calculator", enabled: true },
        { tool: "current_datetime", enabled: true },
        { tool: "structured_output", enabled: true },
        { tool: "gmail_send_message", enabled: true },
        { tool: "pd:slack-send-message-to-channel", enabled: true },
      ]),
    );
    const toolIds = modules.attachments
      .filter((m) => m.kind === "tool")
      .map((m) => m.toolId);
    expect(toolIds).not.toContain("calculator");
    expect(toolIds).not.toContain("current_datetime");
    expect(toolIds).not.toContain("structured_output");
    expect(toolIds).toContain("gmail_send_message");
    expect(toolIds).toContain("pd:slack-send-message-to-channel");
  });
});

describe("live execution state mapping", () => {
  it("optimistically lights Chat trigger while a turn is in flight", () => {
    const graph: ProductAgentGraph = {
      nodes: [
        {
          id: "trigger:chat",
          kind: "trigger_chat",
          label: "Chat",
          configurationStatus: "ready",
        },
        {
          id: "agent",
          kind: "agent",
          label: "AI Agent",
          configurationStatus: "ready",
        },
      ],
      edges: [
        {
          id: "trigger:chat→agent",
          source: "trigger:chat",
          target: "agent",
          style: "dashed",
          role: "main",
        },
      ],
    };
    const merged = mergeOptimisticLiveChatTurn(undefined, graph);
    expect(merged.runStatus).toBe("running");
    expect(merged.nodes["trigger:chat"]?.executionStatus).toBe("success");
    expect(merged.nodes.agent?.executionStatus).toBe("running");
    expect(merged.edges["trigger:chat→agent"]?.executionStatus).toBe("success");
  });

  it("maps tool events to exact tool ids", () => {
    const state = reduceExecutionState([
      { eventType: "runtime.input.received" },
      { eventType: "runtime.model.started" },
      { eventType: "runtime.model.completed" },
      { eventType: "runtime.tool.started", toolId: "pd:slack-send-message-to-channel" },
      { eventType: "runtime.tool.completed", toolId: "pd:slack-send-message-to-channel" },
      { eventType: "runtime.tool.failed", toolId: "gmail_send_message" },
      { eventType: "runtime.connection.required", toolId: "pd:hubspot-create-contact" },
      { eventType: "runtime.output.completed" },
      { eventType: "run.completed" },
    ]);
    expect(state.model).toBe("success");
    expect(state["pd:slack-send-message-to-channel"]).toBe("success");
    expect(state.gmail_send_message).toBe("error");
    expect(state["pd:hubspot-create-contact"]).toBe("waiting_for_connection");
    expect(state.output).toBe("success");
    // Soft tool failures after run.completed must stop the agent spinner.
    expect(state.brain).toBe("error");
  });

  it("maps conversation memory events onto the Memory node", () => {
    const visual = reduceExecutionEvents([
      { eventType: "runtime.input.received" },
      { eventType: "runtime.memory.read.started" },
      { eventType: "runtime.memory.read.completed" },
      { eventType: "runtime.model.started" },
      { eventType: "runtime.model.completed" },
      { eventType: "run.completed" },
    ]);
    expect(visual.nodes["attachment:memory"]?.executionStatus).toBe("success");
    expect(visual.legacy.model).toBe("success");
  });
});
