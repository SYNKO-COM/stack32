import {
  groupToolsByApp,
  isProductFacingTool,
  toolActionLabel,
} from "@/lib/integrations/app-grouping";
import { resolveIntegrationIcon } from "@/lib/integrations/icon-resolver";
import type {
  ConfigurationStatus,
  IntegrationModule,
  ProductAgentGraph,
  ProductEdge,
  ProductNode,
} from "@/lib/domain/product-agent-graph";
import type { AgentSpec, GraphSpec, ToolBinding } from "@/lib/domain/types";

export interface BuildProductGraphInput {
  definition: AgentSpec | null | undefined;
  graph?: GraphSpec | null;
  boundToolIds?: Set<string>;
  boundProviders?: Set<string>;
  modelStatus?: ConfigurationStatus | "needs_setup" | "needs_attention";
  memoryStatus?: ConfigurationStatus | "needs_setup" | "needs_attention";
  toolStatuses?: Record<string, string>;
  scheduleSummary?: string;
}

function bindingLookup(spec: AgentSpec | null | undefined): Map<string, ToolBinding> {
  const map = new Map<string, ToolBinding>();
  for (const b of spec?.toolBindings ?? []) {
    map.set(b.toolId, b);
  }
  return map;
}

function exactModelLabel(spec: AgentSpec | null | undefined): string | undefined {
  if (spec?.model?.provider && spec.model.modelId) {
    return `${spec.model.provider} · ${spec.model.modelId}`;
  }
  return undefined;
}

function normalizeConfigStatus(
  status: string | undefined,
  fallback: ConfigurationStatus,
): ConfigurationStatus {
  if (!status) return fallback;
  if (status === "ready") return "ready";
  if (status === "needs_setup" || status === "setup_required") return "setup_required";
  if (status === "needs_attention" || status === "broken") return "broken";
  return fallback;
}

function toolNeedsConnection(
  toolId: string,
  provider: string,
  binding?: ToolBinding,
): boolean {
  if (binding?.connectionRequirementId) return true;
  if (provider && provider !== "native" && provider !== "custom_api") return true;
  const id = toolId.toLowerCase();
  if (id.startsWith("gmail_") || id.startsWith("calendar_") || id.startsWith("google_docs"))
    return true;
  if (id.startsWith("pd:") || id.startsWith("pipedream:")) return true;
  return false;
}

function collectToolIds(
  spec: AgentSpec | null | undefined,
  graph: GraphSpec | null | undefined,
): string[] {
  const ids = new Set<string>();
  if (spec) {
    for (const t of spec.tools) {
      if (t.enabled && isProductFacingTool(t.tool)) ids.add(t.tool);
    }
  }
  if (graph) {
    for (const node of graph.nodes) {
      if (node.type !== "tool") continue;
      const toolId =
        (typeof node.config?.tool_id === "string" ? node.config.tool_id : undefined) ||
        (typeof node.config?.toolId === "string" ? node.config.toolId : undefined);
      if (toolId && isProductFacingTool(toolId)) ids.add(toolId);
    }
  }
  return [...ids];
}

function buildIntegrationNode(
  group: ReturnType<typeof groupToolsByApp>[number],
  bindings: Map<string, ToolBinding>,
  boundToolIds: Set<string>,
  toolStatuses?: Record<string, string>,
): ProductNode {
  const needsConnection = group.toolIds.some((tid) =>
    toolNeedsConnection(tid, group.provider, bindings.get(tid)),
  );
  const toolBound = group.toolIds.some((tid) => boundToolIds.has(tid));
  const connected = !needsConnection || toolBound;

  let configurationStatus: ConfigurationStatus = connected ? "ready" : "setup_required";
  for (const tid of group.toolIds) {
    const override = toolStatuses?.[tid];
    if (override === "needs_attention") configurationStatus = "broken";
    if (override === "needs_setup" || override === "setup_required") {
      configurationStatus = "setup_required";
    }
  }

  const integration: IntegrationModule = {
    appKey: group.appKey,
    appName: group.appName,
    provider: group.provider,
    toolIds: group.toolIds,
    actions: group.toolIds.map((toolId) => ({
      toolId,
      label: toolActionLabel(toolId),
      approvalMode: bindings.get(toolId)?.approvalMode,
    })),
    connectionStatus: connected ? "connected" : "needs_setup",
    configurationStatus,
  };

  return {
    id: `app:${group.appKey}`,
    kind: "integration",
    label: group.appName,
    icon: resolveIntegrationIcon({ appKey: group.appKey, provider: group.provider }),
    configurationStatus,
    integration,
  };
}

/** Build the product-facing agent structure graph from definition + installation hints. */
export function buildProductAgentGraph(input: BuildProductGraphInput): ProductAgentGraph {
  const { definition, graph, boundToolIds = new Set() } = input;
  const bindings = bindingLookup(definition);
  const nodes: ProductNode[] = [];
  const edges: ProductEdge[] = [];

  const triggers = (definition?.triggers ?? []).filter((t) => t.enabled);
  const hasChat = triggers.length === 0 || triggers.some((t) => t.kind === "chat");
  const hasSchedule = triggers.some((t) => t.kind === "schedule");

  if (hasChat) {
    nodes.push({
      id: "trigger:chat",
      kind: "trigger_chat",
      label: "Chat",
      configurationStatus: "ready",
    });
  }
  if (hasSchedule) {
    nodes.push({
      id: "trigger:schedule",
      kind: "trigger_schedule",
      label: "Schedule",
      subtitle: input.scheduleSummary,
      configurationStatus: "ready",
    });
  }

  const agentName =
    definition?.identity?.name || definition?.name || "AI Agent";
  nodes.push({
    id: "agent",
    kind: "agent",
    label: "AI Agent",
    agentName,
    configurationStatus: "ready",
  });

  for (const trigger of nodes.filter((n) => n.kind.startsWith("trigger"))) {
    edges.push({
      id: `${trigger.id}→agent`,
      source: trigger.id,
      target: "agent",
      style: "solid",
      role: "main",
      sourceHandle: "out",
      targetHandle: "agent-input",
    });
  }

  nodes.push({
    id: "output",
    kind: "output",
    label: "Output",
    subtitle: definition?.output?.format,
    configurationStatus: "ready",
  });
  edges.push({
    id: "agent→output",
    source: "agent",
    target: "output",
    style: "solid",
    role: "main",
    sourceHandle: "agent-output",
    targetHandle: "in",
  });

  const modelStatus = normalizeConfigStatus(input.modelStatus, "ready");
  nodes.push({
    id: "attachment:model",
    kind: "model",
    label: "Model",
    subtitle: exactModelLabel(definition),
    icon: resolveIntegrationIcon({
      appKey: definition?.model?.provider || "model",
      provider: definition?.model?.provider,
      kind: "model",
    }),
    configurationStatus: modelStatus,
  });
  edges.push({
    id: "attachment:model→agent",
    source: "attachment:model",
    target: "agent",
    style: "dashed",
    role: "attachment",
    sourceHandle: "out",
    targetHandle: "agent-model",
  });

  const memoryEnabled =
    (definition?.memory?.conversationEnabled ??
      (definition?.memory?.conversationWindow ?? 0) > 0) ||
    Boolean(definition?.memory?.semanticEnabled);
  if (memoryEnabled) {
    const memStatus = normalizeConfigStatus(input.memoryStatus, "ready");
    nodes.push({
      id: "attachment:memory",
      kind: "memory",
      label: "Memory",
      configurationStatus: memStatus,
    });
    edges.push({
      id: "attachment:memory→agent",
      source: "attachment:memory",
      target: "agent",
      style: "dashed",
      role: "attachment",
      sourceHandle: "out",
      targetHandle: "agent-memory",
    });
  }

  const toolIds = collectToolIds(definition, graph ?? null);
  const groups = groupToolsByApp(toolIds, bindings);
  for (const group of groups) {
    const node = buildIntegrationNode(
      group,
      bindings,
      boundToolIds,
      input.toolStatuses,
    );
    nodes.push(node);
    edges.push({
      id: `${node.id}→agent`,
      source: node.id,
      target: "agent",
      style: "dashed",
      role: "attachment",
      sourceHandle: "out",
      targetHandle: "agent-tools",
    });
  }

  return { nodes, edges };
}
