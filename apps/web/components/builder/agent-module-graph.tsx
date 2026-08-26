"use client";

import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BookOpen,
  Brain,
  Cpu,
  GitBranch,
  Hammer,
  Link2,
  Play,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { ToolConfigForm } from "@/components/builder/tool-config-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/use-translation";
import type { AgentModule, AgentModuleMap, ModuleKind } from "@/lib/domain/agent-modules";
import type { ApprovalMode } from "@/lib/domain/types";
import { setPrefillDraft } from "@/lib/pending-prompt";
import { cn } from "@/lib/utils";

const CHAIN_STEP_X = 230;
const CHAIN_Y = 48;
const ATTACHMENT_Y = 230;
const ATTACHMENT_STEP_X = 148;
const CHAIN_WIDTH = 188;
const ATTACHMENT_WIDTH = 124;

/** Invisible ports — edges still attach, users never click these. */
const HIDDEN_HANDLE =
  "!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0 pointer-events-none";

const KIND_ICONS: Record<ModuleKind, React.ComponentType<{ className?: string }>> = {
  trigger: Play,
  guard: Shield,
  brain: Brain,
  router: GitBranch,
  approval: ShieldCheck,
  output: Send,
  model: Cpu,
  memory: Sparkles,
  knowledge: BookOpen,
  tool: Wrench,
};

const EDGE_STROKE = "hsl(var(--brand) / 0.55)";
const EDGE_STROKE_SOFT = "hsl(var(--muted-foreground) / 0.55)";

export interface AgentConnectionInfo {
  id: string;
  provider: string;
  status: string;
  account_email?: string;
  /** Pipedream app slug (notion, canva, …) when known. */
  app_id?: string | null;
  provider_metadata?: Record<string, unknown> | null;
}

export interface AgentBindingInfo {
  connection_id: string;
  tool_ids: string[];
  enabled: boolean;
}

interface ModuleNodeData extends Record<string, unknown> {
  module: AgentModule;
  title: string;
  subtitle?: string;
  variant: "chain" | "attachment";
  isBrain: boolean;
  selected: boolean;
  onSelect: () => void;
  execState?: string;
}

function execAccent(execState?: string): string {
  switch (execState) {
    case "running":
    case "queued":
      return "border-brand/70 ring-2 ring-brand/30 shadow-brand/10 animate-pulse";
    case "success":
      return "border-emerald-500/60 ring-1 ring-emerald-500/25";
    case "error":
      return "border-destructive/60 ring-1 ring-destructive/30";
    case "waiting_for_approval":
    case "waiting_for_connection":
      return "border-amber-500/60 ring-1 ring-amber-500/25";
    default:
      return "";
  }
}

function readinessAccent(module: AgentModule): string {
  if (module.kind !== "tool") return "";
  if (module.setupStatus === "error" || module.connectionStatus === "error") {
    return "border-destructive/50 ring-1 ring-destructive/20";
  }
  if (module.setupStatus === "needs_setup" || module.ready === false) {
    return "border-amber-500/50 ring-1 ring-amber-500/15";
  }
  if (module.ready === true || module.setupStatus === "ready") {
    return "border-emerald-500/40";
  }
  return "";
}

function readinessIconTone(module: AgentModule): string {
  if (module.kind !== "tool") return "bg-brand/12 text-brand";
  if (module.setupStatus === "error" || module.connectionStatus === "error") {
    return "bg-destructive/10 text-destructive";
  }
  if (module.setupStatus === "needs_setup" || module.ready === false) {
    return "bg-amber-500/12 text-amber-700 dark:text-amber-300";
  }
  if (module.ready === true || module.setupStatus === "ready") {
    return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  }
  return "bg-brand/12 text-brand";
}

function ModuleNode({ data }: NodeProps<Node<ModuleNodeData>>) {
  const Icon = KIND_ICONS[data.module.kind] ?? Wrench;
  const isChain = data.variant === "chain";

  return (
    <div
      className={cn(
        "nopan nodrag",
        isChain ? "w-[188px]" : "w-[124px]",
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          data.onSelect();
        }}
        onPointerDown={(event) => {
          // Keep React Flow from treating the press as a canvas pan.
          event.stopPropagation();
        }}
        aria-pressed={data.selected}
        className={cn(
          "group flex w-full flex-col items-center gap-1.5 rounded-2xl border bg-background text-center shadow-sm",
          "cursor-pointer transition-all duration-200",
          "hover:border-brand/45 hover:shadow-md hover:shadow-brand/5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          readinessAccent(data.module),
          execAccent(data.execState),
          data.selected
            ? "border-brand/60 ring-2 ring-brand/25 shadow-md"
            : "border-border/70",
          isChain ? "px-3.5 py-3.5" : "px-2.5 py-3",
        )}
      >
        {isChain ? (
          <Handle type="target" position={Position.Left} className={HIDDEN_HANDLE} />
        ) : (
          <Handle type="target" position={Position.Top} className={HIDDEN_HANDLE} />
        )}

        <span
          className={cn(
            "flex items-center justify-center rounded-xl transition-transform group-hover:scale-105",
            readinessIconTone(data.module),
            isChain ? "size-10" : "size-8",
          )}
        >
          <Icon className={isChain ? "size-5" : "size-4"} aria-hidden="true" />
        </span>
        <span
          className={cn(
            "block max-w-full truncate font-semibold tracking-tight text-foreground",
            isChain ? "text-[13px]" : "text-[11px]",
          )}
        >
          {data.title}
        </span>
        {data.subtitle ? (
          <span className="block max-w-full truncate text-[10px] leading-snug text-muted-foreground">
            {data.subtitle}
          </span>
        ) : null}

        {isChain ? (
          <Handle type="source" position={Position.Right} className={HIDDEN_HANDLE} />
        ) : null}
        {data.isBrain ? (
          <Handle
            id="capabilities"
            type="source"
            position={Position.Bottom}
            className={HIDDEN_HANDLE}
          />
        ) : null}
      </button>
    </div>
  );
}

const nodeTypes = { module: ModuleNode };

function resolveConnectionForModule(
  module: AgentModule,
  connections: AgentConnectionInfo[],
  bindings: AgentBindingInfo[],
): { connection?: AgentConnectionInfo; toolIds: string[] } {
  const binding = bindings.find(
    (b) =>
      b.enabled &&
      module.toolId &&
      b.tool_ids.some((id) => id === module.toolId || id === module.provider),
  );
  const byBinding = binding
    ? connections.find((c) => c.id === binding.connection_id)
    : undefined;
  const byProvider = module.provider
    ? connections.find((c) => c.provider === module.provider)
    : undefined;
  const connection = byBinding ?? byProvider;
  const toolIds = binding?.tool_ids ?? (module.toolId ? [module.toolId] : []);
  return { connection, toolIds };
}

function friendlyToolTitle(
  module: AgentModule,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): string {
  if (module.label?.trim()) return module.label.trim();
  if (module.toolId) {
    return t(`tools.${module.toolId}`, {
      defaultValue: humanizeToolId(module.toolId),
    });
  }
  return t(`modules.kinds.${module.kind}`);
}

function humanizeToolId(toolId: string): string {
  const cleaned = toolId
    .replace(/^pd:/i, "")
    .replace(/^pipedream:/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!cleaned) return toolId;
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function providerFriendly(
  provider: string | undefined,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): string {
  if (!provider || provider === "native") {
    return t("modules.readiness.builtIn", { defaultValue: "Built-in — ready to use" });
  }
  const known: Record<string, string> = {
    google: "Google",
    pipedream: "Apps",
    slack: "Slack",
    slack_v2: "Slack",
  };
  return t(`builder:connections.providers.${provider}`, {
    defaultValue: known[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1),
  });
}

export function AgentModuleGraph({
  agentId,
  modules,
  connections = [],
  bindings = [],
  toolApprovals,
  onConnectionsChanged,
  executionStates,
}: {
  agentId: string;
  modules: AgentModuleMap;
  connections?: AgentConnectionInfo[];
  bindings?: AgentBindingInfo[];
  toolApprovals?: Record<string, ApprovalMode | string>;
  onConnectionsChanged?: () => void;
  executionStates?: Record<string, string>;
}) {
  const { t } = useTranslation(["structure", "builder"]);
  const router = useRouter();
  const [selected, setSelected] = useState<AgentModule | null>(null);
  // Bumped when an account is linked so the tool config below reloads its
  // remote options in place — no page refresh, panel stays open.
  const [configRefresh, setConfigRefresh] = useState(0);
  const handleConnectionsChanged = () => {
    setConfigRefresh((v) => v + 1);
    onConnectionsChanged?.();
  };

  const label = (module: AgentModule): string =>
    module.kind === "tool"
      ? friendlyToolTitle(module, t)
      : module.label?.trim() || t(`modules.kinds.${module.kind}`);

  const subtitle = (module: AgentModule): string | undefined => {
    if (module.kind === "tool") {
      if (module.setupStatus === "needs_setup" || module.ready === false) {
        return t("modules.readiness.tapToConnect", {
          defaultValue: "Tap to connect",
        });
      }
      if (
        module.provider &&
        module.provider !== "native" &&
        (module.connectionStatus === "connected" || module.ready)
      ) {
        return t("modules.readiness.connected", { defaultValue: "Connected" });
      }
      if (module.connectionStatus === "not_required" || module.provider === "native") {
        return t("modules.readiness.builtInShort", { defaultValue: "Built-in" });
      }
    }
    if (module.kind === "model" && module.detail) {
      return String(module.detail);
    }
    return module.detail;
  };

  const needsSetup = useMemo(
    () =>
      modules.attachments.filter(
        (m) =>
          m.kind === "tool" &&
          (m.setupStatus === "needs_setup" || m.ready === false) &&
          m.provider &&
          m.provider !== "native",
      ),
    [modules.attachments],
  );

  const { nodes, edges } = useMemo(() => {
    const brainIndex = modules.chain.findIndex((m) => m.kind === "brain");
    const brainX = (brainIndex < 0 ? 0 : brainIndex) * CHAIN_STEP_X;

    const chainNodes: Node<ModuleNodeData>[] = modules.chain.map((module, index) => ({
      id: `chain-${module.id}`,
      type: "module",
      position: { x: index * CHAIN_STEP_X, y: CHAIN_Y },
      data: {
        module,
        title: label(module),
        subtitle: subtitle(module),
        variant: "chain",
        isBrain: index === brainIndex,
        selected: selected?.id === module.id,
        onSelect: () => setSelected(module),
        execState:
          executionStates?.[module.id] ||
          executionStates?.[module.kind === "brain" ? "brain" : module.kind === "trigger" ? "input" : module.kind === "output" ? "output" : module.id],
      },
    }));

    const rowWidth = Math.max(modules.attachments.length - 1, 0) * ATTACHMENT_STEP_X;
    const rowStart = brainX + CHAIN_WIDTH / 2 - ATTACHMENT_WIDTH / 2 - rowWidth / 2;

    const attachmentNodes: Node<ModuleNodeData>[] = modules.attachments.map(
      (module, index) => ({
        id: `attach-${module.id}`,
        type: "module",
        position: { x: rowStart + index * ATTACHMENT_STEP_X, y: ATTACHMENT_Y },
        data: {
          module,
          title: label(module),
          subtitle: subtitle(module),
          variant: "attachment",
          isBrain: false,
          selected: selected?.id === module.id,
          onSelect: () => setSelected(module),
          execState:
            executionStates?.[module.toolId ?? ""] ||
            executionStates?.[module.id],
        },
      }),
    );

    const chainEdges: Edge[] = modules.chain.slice(1).map((module, index) => {
      const src = modules.chain[index];
      const srcState =
        executionStates?.[src.id] ||
        (src.kind === "brain"
          ? executionStates?.brain
          : src.kind === "trigger"
            ? executionStates?.input
            : undefined);
      const animated = srcState === "running" || srcState === "queued";
      return {
        id: `edge-${src.id}-${module.id}`,
        source: `chain-${src.id}`,
        target: `chain-${module.id}`,
        type: "smoothstep",
        animated,
        style: {
          stroke: animated ? "var(--brand, #e85d04)" : EDGE_STROKE,
          strokeWidth: animated ? 2.75 : 2.25,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: animated ? "var(--brand, #e85d04)" : EDGE_STROKE,
        },
      };
    });

    const brainId = brainIndex >= 0 ? modules.chain[brainIndex]?.id : undefined;
    const attachmentEdges: Edge[] = brainId
      ? modules.attachments.map((module) => ({
          id: `edge-brain-${module.id}`,
          source: `chain-${brainId}`,
          sourceHandle: "capabilities",
          target: `attach-${module.id}`,
          type: "smoothstep",
          style: {
            stroke: EDGE_STROKE_SOFT,
            strokeWidth: 1.75,
            strokeDasharray: "6 5",
          },
          label: t(`modules.kinds.${module.kind}`),
          labelStyle: {
            fill: "hsl(var(--muted-foreground))",
            fontSize: 10,
            fontWeight: 500,
          },
          labelBgStyle: {
            fill: "hsl(var(--background))",
            fillOpacity: 0.92,
          },
          labelBgPadding: [4, 6] as [number, number],
          labelBgBorderRadius: 6,
        }))
      : [];

    return {
      nodes: [...chainNodes, ...attachmentNodes],
      edges: [...chainEdges, ...attachmentEdges],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels follow i18n + selection highlight
  }, [modules, t, selected?.id, executionStates]);

  const goToBuild = () => {
    setPrefillDraft(t("prefill.graph"));
    router.push(`/agents/${agentId}/build`);
    setSelected(null);
  };

  const selectedConnection = selected
    ? resolveConnectionForModule(selected, connections, bindings)
    : null;
  const approvalMode =
    selected?.toolId && toolApprovals?.[selected.toolId]
      ? toolApprovals[selected.toolId]
      : undefined;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {needsSetup.length > 0 ? (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
              <Link2 className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium text-foreground">
                {t("modules.setupBanner.title", {
                  defaultValue: "Connect your apps to finish setup",
                })}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("modules.setupBanner.body", {
                  defaultValue:
                    "Your agent is ready — link the accounts below so it can create Docs, send email, and more.",
                })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {needsSetup.map((module) => (
                  <Button
                    key={module.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full border-amber-500/35 bg-background/80 text-xs"
                    onClick={() => setSelected(module)}
                  >
                    {label(module)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.28 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          panOnScroll={false}
          zoomOnScroll
          selectionOnDrag={false}
          onNodeClick={(_, node) => {
            const moduleData = (node.data as ModuleNodeData | undefined)?.module;
            if (moduleData) setSelected(moduleData);
          }}
          proOptions={{ hideAttribution: true }}
          className="h-full w-full cursor-grab active:cursor-grabbing [&_.react-flow__node]:cursor-pointer"
          defaultEdgeOptions={{
            type: "smoothstep",
          }}
        >
          <Background gap={20} size={1.25} color="hsl(var(--muted-foreground) / 0.14)" />
        </ReactFlow>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/80 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
        {t("modules.clickHint", {
          defaultValue: "Click any card to open its settings",
        })}
      </p>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full border-l bg-background sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader className="space-y-1 text-left">
                <SheetTitle className="text-lg tracking-tight">{label(selected)}</SheetTitle>
                <SheetDescription className="text-sm">
                  {t(`modules.kinds.${selected.kind}`)}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5 px-1">
                <p className="text-sm leading-relaxed text-foreground/90">
                  {selected.detail || t(`modules.help.${selected.kind}`)}
                </p>

                {selected.kind === "tool" ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/60 bg-foreground/[0.02] p-4">
                      <dl className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">
                            {t("modules.readiness.connection", {
                              defaultValue: "Connection",
                            })}
                          </dt>
                          <dd className="font-medium">
                            {selected.connectionStatus === "connected" || selected.ready
                              ? t("modules.readiness.connected", {
                                  defaultValue: "Connected",
                                })
                              : selected.provider === "native" ||
                                  selected.connectionStatus === "not_required"
                                ? t("modules.readiness.notNeeded", {
                                    defaultValue: "Not needed",
                                  })
                                : t("modules.readiness.needsSetup", {
                                    defaultValue: "Needs setup",
                                  })}
                          </dd>
                        </div>
                        {approvalMode ? (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="text-muted-foreground">
                              {t("builder:connections.approvalMode", {
                                defaultValue: "Approval",
                              })}
                            </dt>
                            <dd className="text-right font-medium">
                              {t(`builder:connections.approvalModes.${approvalMode}`, {
                                defaultValue: String(approvalMode),
                              })}
                            </dd>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">
                            {t("modules.readiness.worksWith", {
                              defaultValue: "Works with",
                            })}
                          </dt>
                          <dd className="text-right font-medium">
                            {providerFriendly(selected.provider, t)}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {selected.provider && selected.provider !== "native" ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          {t("modules.setupBanner.connectTitle", {
                            defaultValue: "Link your account",
                          })}
                        </p>
                        <IntegrationConnectionCard
                          provider={selected.provider}
                          appId={selected.appId}
                          agentId={agentId}
                          toolIds={selectedConnection?.toolIds}
                          status={
                            selected.connectionStatus === "connected" || selected.ready
                              ? "connected"
                              : selected.setupStatus === "error"
                                ? "error"
                                : "needs_setup"
                          }
                          accountEmail={selectedConnection?.connection?.account_email}
                          connectionId={selectedConnection?.connection?.id}
                          onConnected={handleConnectionsChanged}
                          onChanged={handleConnectionsChanged}
                        />
                        {selected.toolId ? (
                          <div className="rounded-2xl border border-border/50 p-3">
                            <p className="mb-2 text-sm font-medium">
                              {t("modules.toolConfig", {
                                defaultValue: "Tool settings",
                              })}
                            </p>
                            <ToolConfigForm
                              agentId={agentId}
                              toolId={selected.toolId}
                              appId={selected.appId}
                              onSaved={onConnectionsChanged}
                              onClose={() => setSelected(null)}
                              refreshKey={configRefresh}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
                        {t("modules.readiness.nativeReady", {
                          defaultValue:
                            "This capability is already included — nothing to connect.",
                        })}
                      </p>
                    )}
                  </div>
                ) : null}

                {selected.kind === "model" ? (
                  <p className="rounded-2xl border border-border/60 bg-foreground/[0.02] px-4 py-3 text-sm text-muted-foreground">
                    {t("modules.help.modelChange", {
                      defaultValue:
                        "Want a faster or smarter model? Ask in Build — Stack32 will update it for you.",
                    })}
                  </p>
                ) : null}

                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 px-0 text-brand hover:bg-transparent hover:text-brand-from"
                  onClick={goToBuild}
                >
                  <Hammer className="size-3.5" aria-hidden="true" />
                  {t("actions.changeInBuild")}
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
