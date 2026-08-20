import { describe, expect, it } from "vitest";

import { reduceExecutionEvents } from "@/lib/domain/execution-state";
import type { ProductAgentGraph } from "@/lib/domain/product-agent-graph";

const miniGraph: ProductAgentGraph = {
  nodes: [
    { id: "trigger:chat", kind: "trigger_chat", label: "Chat", configurationStatus: "ready" },
    { id: "agent", kind: "agent", label: "AI Agent", configurationStatus: "ready" },
    { id: "output", kind: "output", label: "Output", configurationStatus: "ready" },
    {
      id: "app:google_maps_platform",
      kind: "integration",
      label: "Google Maps",
      configurationStatus: "ready",
      integration: {
        appKey: "google_maps_platform",
        appName: "Google Maps",
        provider: "pipedream",
        toolIds: ["pd:google_maps_platform-search-places"],
        actions: [],
        connectionStatus: "connected",
        configurationStatus: "ready",
      },
    },
  ],
  edges: [
    {
      id: "trigger:chat→agent",
      source: "trigger:chat",
      target: "agent",
      style: "solid",
      role: "main",
    },
    {
      id: "agent→output",
      source: "agent",
      target: "output",
      style: "solid",
      role: "main",
    },
  ],
};

describe("live execution trigger activation", () => {
  const graphWithBoth: ProductAgentGraph = {
    nodes: [
      { id: "trigger:chat", kind: "trigger_chat", label: "Chat", configurationStatus: "ready" },
      {
        id: "trigger:schedule",
        kind: "trigger_schedule",
        label: "Schedule",
        configurationStatus: "ready",
      },
      { id: "agent", kind: "agent", label: "AI Agent", configurationStatus: "ready" },
    ],
    edges: [
      {
        id: "trigger:chat→agent",
        source: "trigger:chat",
        target: "agent",
        style: "solid",
        role: "main",
      },
      {
        id: "trigger:schedule→agent",
        source: "trigger:schedule",
        target: "agent",
        style: "solid",
        role: "main",
      },
    ],
  };

  it("lights only Chat on a normal chat run", () => {
    const state = reduceExecutionEvents(
      [{ eventType: "runtime.input.received", rawPayload: { trigger_kind: "chat" } }],
      graphWithBoth,
    );
    expect(state.nodes["trigger:chat"]?.executionStatus).toBe("success");
    expect(state.nodes["trigger:schedule"]?.executionStatus).toBeUndefined();
  });

  it("lights only Schedule when the run came from a schedule", () => {
    const state = reduceExecutionEvents(
      [
        {
          eventType: "runtime.input.received",
          rawPayload: { trigger_kind: "schedule", schedule_id: "sched-1" },
        },
      ],
      graphWithBoth,
    );
    expect(state.nodes["trigger:schedule"]?.executionStatus).toBe("success");
    expect(state.nodes["trigger:chat"]?.executionStatus).toBeUndefined();
  });

  it("defaults missing trigger_kind to Chat (not Schedule)", () => {
    const state = reduceExecutionEvents(
      [{ eventType: "runtime.input.received" }],
      graphWithBoth,
    );
    expect(state.nodes["trigger:chat"]?.executionStatus).toBe("success");
    expect(state.nodes["trigger:schedule"]?.executionStatus).toBeUndefined();
  });
});

describe("reduceExecutionEvents soft-fail Structure sync", () => {
  it("stops agent spinning and surfaces hidden fetch_url errors on agent", () => {
    const state = reduceExecutionEvents(
      [
        { eventType: "run.started", sequence: 1 },
        { eventType: "runtime.input.received", sequence: 2 },
        {
          eventType: "runtime.tool.completed",
          toolId: "pd:google_maps_platform-search-places",
          sequence: 3,
        },
        {
          eventType: "runtime.tool.failed",
          toolId: "fetch_url",
          code: "UnsafeURL_Error",
          error: "UnsafeURL_Error",
          sequence: 4,
        },
        { eventType: "run.completed", sequence: 5 },
      ],
      miniGraph,
    );

    expect(state.runStatus).toBe("partial");
    expect(state.nodes.agent?.executionStatus).toBe("error");
    expect(state.nodes.output?.executionStatus).toBe("error");
    expect(state.nodes["app:google_maps_platform"]?.executionStatus).toBe("success");
    expect(state.error?.code).toMatch(/UnsafeURL/i);
    expect(state.error?.nodeId).toBe("agent");
    expect(state.nodeErrors?.agent?.code).toMatch(/UnsafeURL/i);
  });

  it("finalizes clean runs to success even without output.completed", () => {
    const state = reduceExecutionEvents(
      [
        { eventType: "run.started", sequence: 1 },
        { eventType: "runtime.input.received", sequence: 2 },
        { eventType: "runtime.model.completed", sequence: 3 },
        { eventType: "run.completed", sequence: 4 },
      ],
      miniGraph,
    );
    expect(state.runStatus).toBe("success");
    expect(state.nodes.agent?.executionStatus).toBe("success");
    expect(state.nodes.output?.executionStatus).toBe("success");
  });
});
