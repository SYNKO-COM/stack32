import type { AgentSpec, GraphNodeType, GraphSpec, ToolBinding } from "@/lib/domain/types";

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
  setupStatus?: string;
  connectionStatus?: string;
  risk?: string;
  provider?: string;
  /** Pipedream / OAuth app slug (e.g. notion, slack). */
  appId?: string;
}

export interface AgentModuleMap {
  /** Left-to-right execution chain. */
  chain: AgentModule[];
  /** Capabilities plugged into the brain, drawn underneath it. */
  attachments: AgentModule[];
}

export interface BuildAgentModulesOptions {
  /** Tool ids that already have an enabled binding. */
  boundToolIds?: Iterable<string>;
  /** Providers that already have an active connection. */
  boundProviders?: Iterable<string>;
  /**
   * Optional readiness overrides from the installation (parent passes when known).
   * When omitted, model stays "ready" for backward compatibility until data exists.
   */
  modelStatus?: "ready" | "setup_required" | "needs_setup" | "needs_attention";
  memoryStatus?: "ready" | "setup_required" | "needs_setup" | "needs_attention";
  /** Per toolId status overrides. */
  toolStatuses?: Record<string, "ready" | "setup_required" | "needs_setup" | "needs_attention">;
}

function statusToReady(status: string | undefined, fallbackReady: boolean): boolean {
  if (!status) return fallbackReady;
  return status === "ready";
}

function normalizeSetupStatus(
  status: string | undefined,
  fallback: string,
): string {
  if (!status) return fallback;
  if (status === "setup_required") return "needs_setup";
  return status;
}

// MVP Structure is a straight line: Trigger → AI Agent (brain) → Output. Internal
// kinds (guardrail, router, approval, transform) run at runtime but are hidden
// here so the canvas reads like n8n, not a compiler graph.
const CHAIN_KINDS: Partial<Record<GraphNodeType, ModuleKind>> = {
  input: "trigger",
  llm: "brain",
  output: "output",
  sub_agent: "brain",
};

const ATTACHMENT_KINDS: Partial<Record<GraphNodeType, ModuleKind>> = {
  tool: "tool",
  knowledge: "knowledge",
  memory_read: "memory",
  memory_write: "memory",
};

/** Internal helpers — keep in runtime, hide from product Structure canvas. */
const HIDDEN_STRUCTURE_TOOL_IDS = new Set([
  "current_datetime",
  "structured_output",
  "calculator",
  "fetch_url",
]);

function isProductFacingTool(toolId: string | undefined): boolean {
  if (!toolId) return true;
  if (HIDDEN_STRUCTURE_TOOL_IDS.has(toolId)) return false;
  return true;
}

function toolNeedsConnection(toolId: string | undefined, provider?: string, config?: Record<string, unknown>): boolean {
  if (!toolId) return false;
  if (config?.connection_required === true) return true;
  if (provider && provider !== "native" && provider !== "custom_api") return true;
  const id = toolId.toLowerCase();
  if (id.startsWith("gmail_") || id.startsWith("calendar_") || id.startsWith("google_docs")) return true;
  if (id === "gmail" || id === "calendar" || id === "email" || id === "mail") return true;
  if (id.includes("google_docs") || id.includes("google-docs") || id.includes("docs.")) return true;
  if (id.includes("google_drive") || id.includes("drive.")) return true;
  if (id.startsWith("pd:") || id.startsWith("pipedream:")) return true;
  return false;
}

function inferProvider(toolId: string | undefined, provider?: string): string | undefined {
  if (!toolId) return provider;
  const id = toolId.toLowerCase();
  // Google product tools connect via Pipedream (per-app accounts).
  if (
    id.startsWith("gmail_") ||
    id.startsWith("calendar_") ||
    id.startsWith("google_docs") ||
    id === "gmail" ||
    id === "calendar" ||
    id === "email" ||
    id === "mail" ||
    id.includes("google_docs") ||
    id.includes("google-docs") ||
    id.includes("google_drive")
  ) {
    return "pipedream";
  }
  // Marketplace apps go through Pipedream Connect.
  if (
    id.startsWith("pd:") ||
    id.startsWith("pipedream:") ||
    id.includes("pipedream")
  ) {
    return provider && provider !== "native" ? provider : "pipedream";
  }
  if (provider) return provider;
  return "native";
}

/** Exact `provider/model_id` when the spec carries a schema-5 model; else the profile. */
function exactModelLabel(spec: AgentSpec | null | undefined): string | undefined {
  if (spec?.model?.provider && spec.model.modelId) {
    return `${spec.model.provider}/${spec.model.modelId}`;
  }
  return spec?.modelProfile?.profile;
}

/** First enabled Chat/Schedule trigger kind, defaulting to chat. */
function primaryTriggerKind(spec: AgentSpec | null | undefined): "chat" | "schedule" {
  const enabled = (spec?.triggers ?? []).filter((t) => t.enabled);
  if (enabled.some((t) => t.kind === "schedule") && !enabled.some((t) => t.kind === "chat")) {
    return "schedule";
  }
  return "chat";
}

function bindingLookup(spec: AgentSpec | null | undefined): Map<string, ToolBinding> {
  const map = new Map<string, ToolBinding>();
  for (const b of spec?.toolBindings ?? []) {
    map.set(b.toolId, b);
  }
  return map;
}

function enrichToolModule(
  module: AgentModule,
  bindings: Map<string, ToolBinding>,
  boundToolIds: Set<string>,
  boundProviders: Set<string>,
  nodeConfig?: Record<string, unknown>,
): AgentModule {
  const binding = module.toolId ? bindings.get(module.toolId) : undefined;
  const provider =
    inferProvider(
      module.toolId,
      binding?.provider ?? (typeof nodeConfig?.provider === "string" ? nodeConfig.provider : undefined),
    ) ?? undefined;
  const appId =
    (typeof binding?.appId === "string" ? binding.appId : undefined) ||
    (typeof nodeConfig?.app_id === "string" ? nodeConfig.app_id : undefined) ||
    (typeof nodeConfig?.appId === "string" ? nodeConfig.appId : undefined) ||
    (provider === "pipedream" && module.toolId
      ? module.toolId.replace(/^pd:/i, "").split("-")[0]
      : undefined) ||
    (provider && provider !== "native" && provider !== "pipedream" ? provider : undefined);
  const needsConnection = toolNeedsConnection(module.toolId, provider, {
    ...nodeConfig,
    ...(binding?.config ?? {}),
    connection_required:
      nodeConfig?.connection_required ??
      (binding?.connectionRequirementId ? true : undefined),
  });
  const approvalMode = binding?.approvalMode;
  const risk =
    typeof nodeConfig?.risk === "string"
      ? nodeConfig.risk
      : approvalMode === "always"
        ? "high"
        : approvalMode === "conditional"
          ? "medium"
          : undefined;

  if (!needsConnection) {
    return {
      ...module,
      provider,
      appId,
      ready: true,
      setupStatus: "ready",
      connectionStatus: "not_required",
      risk,
    };
  }

  const toolBound = module.toolId ? boundToolIds.has(module.toolId) : false;
  const connected = toolBound;

  return {
    ...module,
    provider,
    appId,
    ready: connected,
    setupStatus: connected ? "ready" : "needs_setup",
    connectionStatus: connected ? "connected" : "needs_setup",
    risk,
  };
}

function fromGraph(
  graph: GraphSpec,
  bindings: Map<string, ToolBinding>,
  boundToolIds: Set<string>,
  boundProviders: Set<string>,
  spec: AgentSpec | null | undefined,
  options?: BuildAgentModulesOptions,
): AgentModuleMap {
  const chain: AgentModule[] = [];
  const attachments: AgentModule[] = [];
  const seenAttachments = new Set<string>();
  const triggerKind = primaryTriggerKind(spec);

  for (const node of graph.nodes) {
    const chainKind = CHAIN_KINDS[node.type];
    if (chainKind) {
      chain.push({
        id: node.id,
        kind: chainKind,
        label: node.name,
        detail: chainKind === "trigger" ? triggerKind : node.description,
        ready: true,
        setupStatus: "ready",
      });
      continue;
    }
    const attachmentKind = ATTACHMENT_KINDS[node.type];
    if (!attachmentKind) continue;
    const toolId =
      typeof node.config?.tool_id === "string"
        ? node.config.tool_id
        : typeof node.config?.toolId === "string"
          ? node.config.toolId
          : undefined;
    if (attachmentKind === "tool" && !isProductFacingTool(toolId)) continue;
    // memory_read + memory_write collapse into a single "Memory" chip.
    const key = attachmentKind === "memory" ? "memory" : (toolId ?? node.id);
    if (seenAttachments.has(key)) continue;
    seenAttachments.add(key);
    const memoryOverride = attachmentKind === "memory" ? options?.memoryStatus : undefined;
    const toolOverride =
      attachmentKind === "tool" && toolId ? options?.toolStatuses?.[toolId] : undefined;
    const base: AgentModule = {
      id: key,
      kind: attachmentKind,
      label: attachmentKind === "memory" ? undefined : node.name,
      detail: node.description,
      toolId,
      ready: statusToReady(memoryOverride ?? toolOverride, true),
      setupStatus: normalizeSetupStatus(memoryOverride ?? toolOverride, "ready"),
    };
    attachments.push(
      attachmentKind === "tool"
        ? (() => {
            const enriched = enrichToolModule(
              base,
              bindings,
              boundToolIds,
              boundProviders,
              node.config,
            );
            if (!toolOverride) return enriched;
            return {
              ...enriched,
              ready: statusToReady(toolOverride, enriched.ready ?? false),
              setupStatus: normalizeSetupStatus(toolOverride, enriched.setupStatus ?? "ready"),
            };
          })()
        : base,
    );
  }

  return { chain, attachments };
}

function fromSpec(
  spec: AgentSpec,
  bindings: Map<string, ToolBinding>,
  boundToolIds: Set<string>,
  boundProviders: Set<string>,
  options?: BuildAgentModulesOptions,
): AgentModuleMap {
  const chain: AgentModule[] = [
    { id: "input", kind: "trigger", detail: primaryTriggerKind(spec), ready: true, setupStatus: "ready" },
    { id: "brain", kind: "brain", detail: exactModelLabel(spec), ready: true, setupStatus: "ready" },
    { id: "output", kind: "output", detail: spec.output.format, ready: true, setupStatus: "ready" },
  ];

  const attachments: AgentModule[] = spec.tools
    .filter((tool) => tool.enabled && isProductFacingTool(tool.tool))
    .map((tool) => {
      const enriched = enrichToolModule(
        { id: tool.tool, kind: "tool" as const, toolId: tool.tool },
        bindings,
        boundToolIds,
        boundProviders,
      );
      const override = options?.toolStatuses?.[tool.tool];
      if (!override) return enriched;
      return {
        ...enriched,
        ready: statusToReady(override, enriched.ready ?? false),
        setupStatus: normalizeSetupStatus(override, enriched.setupStatus ?? "ready"),
      };
    });

  if (spec.knowledge.enabled) {
    attachments.push({ id: "knowledge", kind: "knowledge", ready: true, setupStatus: "ready" });
  }
  if (spec.memory.conversationEnabled ?? spec.memory.conversationWindow > 0) {
    const memStatus = options?.memoryStatus;
    attachments.push({
      id: "memory",
      kind: "memory",
      ready: statusToReady(memStatus, true),
      setupStatus: normalizeSetupStatus(memStatus, "ready"),
    });
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
  options?: BuildAgentModulesOptions,
): AgentModuleMap {
  const boundToolIds = new Set(options?.boundToolIds ?? []);
  const boundProviders = new Set(options?.boundProviders ?? []);
  const bindings = bindingLookup(spec);
  const modelStatus = options?.modelStatus;
  const modelReady = statusToReady(modelStatus, true);
  const modelSetup = normalizeSetupStatus(modelStatus, "ready");

  if (graph && graph.nodes.length > 0) {
    const fromCompiled = fromGraph(graph, bindings, boundToolIds, boundProviders, spec, options);
    if (fromCompiled.chain.length > 0) {
      // The model node is always shown as a capability of the brain, like n8n.
      // Readiness comes from installation LLM config when the parent passes modelStatus.
      fromCompiled.attachments.unshift({
        id: "model",
        kind: "model",
        detail: exactModelLabel(spec),
        ready: modelReady,
        setupStatus: modelSetup,
      });
      return fromCompiled;
    }
  }
  if (spec) {
    const derived = fromSpec(spec, bindings, boundToolIds, boundProviders, options);
    derived.attachments.unshift({
      id: "model",
      kind: "model",
      detail: exactModelLabel(spec),
      ready: modelReady,
      setupStatus: modelSetup,
    });
    return derived;
  }
  return { chain: [], attachments: [] };
}
