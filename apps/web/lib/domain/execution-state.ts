import type { ModuleExecState } from "@/hooks/use-live-execution";
import { resolveAppKey } from "@/lib/integrations/app-grouping";
import type { ProductAgentGraph } from "@/lib/domain/product-agent-graph";

export type RunStatus = "idle" | "running" | "success" | "error" | "partial";

export interface LiveEventPayload {
  eventType: string;
  toolId?: string;
  provider?: string;
  appId?: string;
  code?: string;
  errorType?: string;
  error?: string;
  mappingKey?: string;
  sequence?: number;
  rawPayload?: Record<string, unknown>;
}

export interface NodeVisualState {
  configurationStatus?: string;
  executionStatus: ModuleExecState;
}

export interface EdgeVisualState {
  executionStatus: ModuleExecState;
}

export interface ExecutionVisualState {
  runStatus: RunStatus;
  nodes: Record<string, NodeVisualState>;
  edges: Record<string, EdgeVisualState>;
  /** Legacy flat map for backward compatibility. */
  legacy: Record<string, ModuleExecState>;
  /** Last failure details for Structure drawers (copyable logs). */
  error?: ExecutionErrorInfo | null;
  /** Per-node failure details (so Canva never shows Calendar errors). */
  nodeErrors?: Record<string, ExecutionErrorInfo>;
}

export interface ExecutionErrorInfo {
  code?: string;
  message?: string;
  errorType?: string;
  /** Best-effort node that failed (agent / integration / model…). */
  nodeId?: string;
  logs: Array<{ sequence: number; eventType: string; summary: string }>;
  fullLogText: string;
}

function toolToNodeId(toolId: string, graph: ProductAgentGraph | null): string {
  if (!graph) return toolId;
  const appKey = resolveAppKey(toolId);
  const integration = graph.nodes.find(
    (n) => n.kind === "integration" && n.integration?.appKey === appKey,
  );
  // Native helpers (fetch_url, web_search, …) have no Structure node — surface on agent.
  return integration?.id ?? "agent";
}

function isVisibleProductNode(
  nodeId: string,
  graph: ProductAgentGraph | null,
): boolean {
  if (!graph) return nodeId === "agent" || nodeId === "output";
  return graph.nodes.some((n) => n.id === nodeId);
}

function edgeBetween(graph: ProductAgentGraph | null, source: string, target: string): string | undefined {
  if (!graph) return undefined;
  return graph.edges.find((e) => e.source === source && e.target === target)?.id;
}

/**
 * Map Live run_events → product graph visual states.
 * Agent stays running until run.completed / run.failed.
 */
export function reduceExecutionEvents(
  events: LiveEventPayload[],
  graph: ProductAgentGraph | null = null,
): ExecutionVisualState {
  const legacy: Record<string, ModuleExecState> = {
    input: "idle",
    brain: "idle",
    model: "idle",
    output: "idle",
  };
  const nodes: Record<string, NodeVisualState> = {};
  const edges: Record<string, EdgeVisualState> = {};
  const toolStates: Record<string, ModuleExecState> = {};
  const nodeErrors: Record<string, ExecutionErrorInfo> = {};
  let runStatus: RunStatus = "idle";
  let runEnded = false;
  let runFailed = false;
  let anyToolError = false;
  let anyToolSuccess = false;
  let lastFailCode: string | undefined;
  let lastFailType: string | undefined;
  let lastFailMessage: string | undefined;
  let lastFailNodeId: string | undefined;
  const logLines: ExecutionErrorInfo["logs"] = [];

  const setNode = (id: string, status: ModuleExecState) => {
    nodes[id] = { executionStatus: status };
    legacy[id] = status;
  };

  const setEdge = (id: string, status: ModuleExecState) => {
    edges[id] = { executionStatus: status };
  };

  for (const event of events) {
    const t = event.eventType;
    const seq = event.sequence ?? logLines.length + 1;
    const bits = [
      event.toolId ? `tool=${event.toolId}` : null,
      event.code ? `code=${event.code}` : null,
      event.errorType ? `type=${event.errorType}` : null,
      event.error ? `error=${event.error}` : null,
      event.mappingKey ? `key=${event.mappingKey}` : null,
    ].filter(Boolean);
    logLines.push({
      sequence: seq,
      eventType: t,
      summary: bits.length ? bits.join(" · ") : "—",
    });

    if (t.includes("run.started") || t.includes("runtime.run.started")) {
      runStatus = "running";
      setNode("agent", "running");
      legacy.brain = "running";
    }
    if (t.includes("run.completed") || t.includes("runtime.run.completed")) {
      runEnded = true;
    }
    if (t.includes("run.failed") || t.includes("runtime.run.failed")) {
      runEnded = true;
      runFailed = true;
      lastFailCode = event.code || lastFailCode;
      lastFailType = event.errorType || lastFailType;
      lastFailMessage = event.error || lastFailMessage;
      lastFailNodeId = "agent";
    }
    if (t.includes("run.canceled") || t.includes("runtime.run.canceled")) {
      // Cancel / clear = reset to idle, not an error state on the structure.
      runEnded = true;
      runFailed = false;
      runStatus = "idle";
      for (const key of Object.keys(nodes)) delete nodes[key];
      for (const key of Object.keys(edges)) delete edges[key];
      for (const key of Object.keys(legacy)) delete legacy[key];
      lastFailCode = undefined;
      lastFailMessage = undefined;
      lastFailNodeId = undefined;
    }

    if (t.includes("runtime.input.received")) {
      const raw = event.rawPayload ?? {};
      const triggerKind =
        raw.trigger_kind === "schedule" ||
        (typeof raw.schedule_id === "string" && raw.schedule_id.length > 0)
          ? "schedule"
          : raw.trigger_kind === "tool"
            ? "tool"
            : "chat";
      if (triggerKind === "schedule") {
        setNode("trigger:schedule", "success");
        legacy.input = "success";
        const e = edgeBetween(graph, "trigger:schedule", "agent");
        if (e) setEdge(e, "success");
      } else if (triggerKind === "tool") {
        setNode("trigger:tool", "success");
        legacy.input = "success";
        const e = edgeBetween(graph, "trigger:tool", "agent");
        if (e) setEdge(e, "success");
      } else {
        setNode("trigger:chat", "success");
        legacy.input = "success";
        const e = edgeBetween(graph, "trigger:chat", "agent");
        if (e) setEdge(e, "success");
      }
      setNode("agent", "running");
      legacy.brain = "running";
    }

    if (t.includes("runtime.model.started")) {
      setNode("attachment:model", "running");
      legacy.model = "running";
      setNode("agent", "running");
      legacy.brain = "running";
      const e = edgeBetween(graph, "attachment:model", "agent");
      if (e) setEdge(e, "running");
    }
    if (t.includes("runtime.model.completed")) {
      setNode("attachment:model", "success");
      legacy.model = "success";
      const e = edgeBetween(graph, "attachment:model", "agent");
      if (e) setEdge(e, "success");
    }

    if (t.includes("runtime.memory.")) {
      const memStatus = t.includes(".failed")
        ? "error"
        : t.includes(".started")
          ? "running"
          : "success";
      setNode("attachment:memory", memStatus);
      const e = edgeBetween(graph, "attachment:memory", "agent");
      if (e) setEdge(e, memStatus);
      setNode("agent", memStatus === "error" ? "error" : "running");
      legacy.brain = memStatus === "error" ? "error" : "running";
    }

    if (t.includes("runtime.tool.started") && event.toolId) {
      const nodeId = toolToNodeId(event.toolId, graph);
      toolStates[event.toolId] = "running";
      setNode(nodeId, "running");
      setNode("agent", "running");
      legacy.brain = "running";
      legacy[event.toolId] = "running";
      const e = edgeBetween(graph, nodeId, "agent");
      if (e) setEdge(e, "running");
    }
    if (t.includes("runtime.tool.completed") && event.toolId) {
      const nodeId = toolToNodeId(event.toolId, graph);
      toolStates[event.toolId] = "success";
      anyToolSuccess = true;
      setNode(nodeId, "success");
      legacy[event.toolId] = "success";
      const e = edgeBetween(graph, nodeId, "agent");
      if (e) setEdge(e, "success");
    }
    if (t.includes("runtime.tool.failed") && event.toolId) {
      const nodeId = toolToNodeId(event.toolId, graph);
      toolStates[event.toolId] = "error";
      anyToolError = true;
      setNode(nodeId, "error");
      legacy[event.toolId] = "error";
      const e = edgeBetween(graph, nodeId, "agent");
      if (e) setEdge(e, "error");
      const failCode = event.code || event.error || undefined;
      const failMessage =
        (typeof event.rawPayload?.message === "string"
          ? event.rawPayload.message
          : undefined) ||
        event.error ||
        failCode;
      lastFailCode = failCode || lastFailCode;
      lastFailMessage = failMessage || lastFailMessage;
      lastFailNodeId = nodeId;
      nodeErrors[nodeId] = {
        code: failCode,
        message: failMessage || failCode || "Tool failed",
        errorType: event.errorType,
        nodeId,
        logs: logLines.slice(),
        fullLogText: logLines
          .map((l) => `#${l.sequence} ${l.eventType} — ${l.summary}`)
          .join("\n"),
      };
    }
    if (t.includes("runtime.connection.required") && event.toolId) {
      const nodeId = toolToNodeId(event.toolId, graph);
      toolStates[event.toolId] = "waiting_for_connection";
      setNode(nodeId, "waiting_for_connection");
      legacy[event.toolId] = "waiting_for_connection";
    }
    if (
      (t.includes("runtime.approval.requested") || t.includes("runtime.approval.pending")) &&
      event.toolId
    ) {
      const nodeId = toolToNodeId(event.toolId, graph);
      toolStates[event.toolId] = "waiting_for_approval";
      setNode(nodeId, "waiting_for_approval");
      legacy[event.toolId] = "waiting_for_approval";
    }

    if (t.includes("runtime.output.completed")) {
      setNode("output", "success");
      legacy.output = "success";
      const e = edgeBetween(graph, "agent", "output");
      if (e) setEdge(e, "success");
    }
    if (t.includes("runtime.output.failed")) {
      setNode("output", "error");
      legacy.output = "error";
      runFailed = true;
    }
  }

  if (runEnded) {
    // Soft-fail path: run.completed with tool errors (e.g. fetch_url UnsafeURL) still
    // returns a chat answer — Structure must stop spinning and show the failure.
    if (runFailed || anyToolError || legacy.output === "error") {
      runStatus = anyToolSuccess && !runFailed ? "partial" : "error";
      setNode("agent", "error");
      legacy.brain = "error";
      if (legacy.output !== "success") {
        setNode("output", "error");
        legacy.output = "error";
      }
      lastFailNodeId = lastFailNodeId || "agent";
      if (lastFailNodeId && !isVisibleProductNode(lastFailNodeId, graph)) {
        lastFailNodeId = "agent";
      }
      if (lastFailNodeId === "agent" && (lastFailCode || lastFailMessage)) {
        nodeErrors.agent = {
          code: lastFailCode,
          message: lastFailMessage || lastFailCode || "Run failed",
          errorType: lastFailType,
          nodeId: "agent",
          logs: logLines.slice(),
          fullLogText: logLines
            .map((l) => `#${l.sequence} ${l.eventType} — ${l.summary}`)
            .join("\n"),
        };
      }
    } else {
      // Run finished cleanly — always finalize agent + output (never leave "running").
      if (legacy.output !== "success") {
        setNode("output", "success");
        legacy.output = "success";
        const e = edgeBetween(graph, "agent", "output");
        if (e) setEdge(e, "success");
      }
      runStatus = "success";
      setNode("agent", "success");
      legacy.brain = "success";
    }
  } else if (runStatus === "running" || legacy.brain === "running") {
    runStatus = "running";
    if (!nodes.agent) {
      setNode("agent", "running");
      legacy.brain = "running";
    }
  }

  // Aggregate integration nodes from per-tool states when multiple tools share an app.
  if (graph) {
    for (const node of graph.nodes) {
      if (node.kind !== "integration" || !node.integration) continue;
      const statuses = node.integration.toolIds.map((tid) => toolStates[tid]).filter(Boolean);
      if (statuses.length === 0) continue;
      let agg: ModuleExecState = "idle";
      if (statuses.some((s) => s === "running" || s === "queued")) agg = "running";
      else if (statuses.some((s) => s === "error")) agg = "error";
      else if (statuses.some((s) => s === "waiting_for_connection" || s === "waiting_for_approval"))
        agg = statuses.find((s) => s === "waiting_for_connection" || s === "waiting_for_approval")!;
      else if (statuses.every((s) => s === "success")) agg = "success";
      setNode(node.id, agg);
    }
  }

  // While paused for the user, the agent node shows pause — not a spinner.
  if (!runEnded) {
    const waitingStatuses = Object.values(nodes)
      .map((s) => s.executionStatus)
      .filter(
        (s) => s === "waiting_for_approval" || s === "waiting_for_connection",
      );
    if (waitingStatuses.length > 0) {
      const pauseStatus = waitingStatuses.includes("waiting_for_approval")
        ? "waiting_for_approval"
        : "waiting_for_connection";
      setNode("agent", pauseStatus);
      legacy.brain = pauseStatus;
      runStatus = pauseStatus === "waiting_for_approval" ? "running" : runStatus;
    }
  }

  const error: ExecutionErrorInfo | null =
    runStatus === "error" || runStatus === "partial"
      ? {
          code: lastFailCode,
          message:
            lastFailMessage ||
            (lastFailCode ? `Run failed (${lastFailCode})` : "Run failed"),
          errorType: lastFailType,
          nodeId: lastFailNodeId,
          logs: logLines,
          fullLogText: logLines
            .map((l) => `#${l.sequence} ${l.eventType} — ${l.summary}`)
            .join("\n"),
        }
      : null;

  return { runStatus, nodes, edges, legacy, error, nodeErrors };
}

/**
 * Instant Structure feedback while a Live turn is in flight but run_events
 * have not arrived yet (optimistic send / SSE lag).
 */
export function mergeOptimisticLiveChatTurn(
  base: ExecutionVisualState | undefined,
  graph: ProductAgentGraph | null,
): ExecutionVisualState {
  const hasChat = graph?.nodes.some((n) => n.id === "trigger:chat") ?? true;
  const nodes: Record<string, NodeVisualState> = { ...(base?.nodes ?? {}) };
  const edges: Record<string, EdgeVisualState> = { ...(base?.edges ?? {}) };
  const legacy: Record<string, ModuleExecState> = { ...(base?.legacy ?? {}) };

  if (hasChat) {
    nodes["trigger:chat"] = { executionStatus: "success" };
    legacy.input = "success";
    legacy["trigger:chat"] = "success";
    const chatEdge = graph?.edges.find(
      (e) => e.source === "trigger:chat" && e.target === "agent",
    );
    if (chatEdge) {
      edges[chatEdge.id] = { executionStatus: "success" };
    }
  }

  const agentStatus = nodes.agent?.executionStatus;
  if (!agentStatus || agentStatus === "idle") {
    nodes.agent = { executionStatus: "running" };
    legacy.brain = "running";
  }

  const runStatus =
    base?.runStatus && base.runStatus !== "idle" ? base.runStatus : "running";

  return {
    runStatus,
    nodes,
    edges,
    legacy,
    error: base?.error ?? null,
    nodeErrors: base?.nodeErrors,
  };
}

/** Backward-compatible flat map reducer. */
export function reduceExecutionState(events: LiveEventPayload[]): Record<string, ModuleExecState> {
  return reduceExecutionEvents(events).legacy;
}
