import type { AgentSpec, GraphNodeType, GraphSpec } from "@/lib/domain/types";

/**
 * Simplified module model for the "Agent IA" canvas.
 *
 * The compiled GraphSpec is precise but too technical to read at a glance, so
 * it is folded into a short main chain (trigger → brain → output) plus
 * attachments that hang under the brain, the way n8n renders an agent node.
 */
export type ModuleKind =
  | "trigger"
  | "guard"
  | "brain"
  | "router"
  | "approval"
  | "output"
  | "model"
  | "memory"
  | "knowledge"
  | "tool";

export interface AgentModule {
  id: string;
  kind: ModuleKind;
  /** Human label, already resolved (falls back to the i18n label of the kind). */
  label?: string;
  detail?: string;
  /** Tool identifier for tool modules — drives the integration to configure. */
  toolId?: string;
  /** False when the module still needs credentials or a connection. */
  ready?: boolean;
}

export interface AgentModuleMap {
  /** Left-to-right execution chain. */
  chain: AgentModule[];
  /** Capabilities plugged into the brain, drawn underneath it. */
  attachments: AgentModule[];
}

const CHAIN_KINDS: Partial<Record<GraphNodeType, ModuleKind>> = {
  input: "trigger",
  guardrail: "guard",
  llm: "brain",
  router: "router",
  approval: "approval",
  output: "output",
  transform: "router",
  sub_agent: "brain",
};

const ATTACHMENT_KINDS: Partial<Record<GraphNodeType, ModuleKind>> = {
  tool: "tool",
  knowledge: "knowledge",
  memory_read: "memory",
  memory_write: "memory",
};

function fromGraph(graph: GraphSpec): AgentModuleMap {
  const chain: AgentModule[] = [];
  const attachments: AgentModule[] = [];
  const seenAttachments = new Set<string>();

  for (const node of graph.nodes) {
    const chainKind = CHAIN_KINDS[node.type];
    if (chainKind) {
      chain.push({
        id: node.id,
        kind: chainKind,
        label: node.name,
        detail: node.description,
      });
      continue;
    }
    const attachmentKind = ATTACHMENT_KINDS[node.type];
    if (!attachmentKind) continue;
    const toolId =
      typeof node.config?.tool_id === "string" ? node.config.tool_id : undefined;
    // memory_read + memory_write collapse into a single "Memory" chip.
    const key = attachmentKind === "memory" ? "memory" : (toolId ?? node.id);
    if (seenAttachments.has(key)) continue;
    seenAttachments.add(key);
    attachments.push({
      id: key,
      kind: attachmentKind,
      label: attachmentKind === "memory" ? undefined : node.name,
      detail: node.description,
      toolId,
    });
  }

  return { chain, attachments };
}

function fromSpec(spec: AgentSpec): AgentModuleMap {
  const chain: AgentModule[] = [
    { id: "input", kind: "trigger" },
    { id: "brain", kind: "brain", detail: spec.modelProfile.profile },
    { id: "output", kind: "output", detail: spec.output.format },
  ];

  const attachments: AgentModule[] = spec.tools
    .filter((tool) => tool.enabled)
    .map((tool) => ({ id: tool.tool, kind: "tool" as const, toolId: tool.tool }));

  if (spec.knowledge.enabled) {
    attachments.push({ id: "knowledge", kind: "knowledge" });
  }
  if (spec.memory.conversationEnabled ?? spec.memory.conversationWindow > 0) {
    attachments.push({ id: "memory", kind: "memory" });
  }

  return { chain, attachments };
}

/**
 * Builds the canvas model. The compiled graph wins when present; otherwise the
 * draft spec still gives the user something meaningful to look at.
 */
export function buildAgentModules(
  graph: GraphSpec | null | undefined,
  spec: AgentSpec | null | undefined,
): AgentModuleMap {
  if (graph && graph.nodes.length > 0) {
    const fromCompiled = fromGraph(graph);
    if (fromCompiled.chain.length > 0) {
      // The model node is always shown as a capability of the brain, like n8n.
      const profile = spec?.modelProfile.profile;
      fromCompiled.attachments.unshift({
        id: "model",
        kind: "model",
        detail: profile,
      });
      return fromCompiled;
    }
  }
  if (spec) {
    const derived = fromSpec(spec);
    derived.attachments.unshift({
      id: "model",
      kind: "model",
      detail: spec.modelProfile.profile,
    });
    return derived;
  }
  return { chain: [], attachments: [] };
}
