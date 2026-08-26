"use client";

import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AgentBindingInfo,
  AgentConnectionInfo,
} from "@/components/builder/agent-module-graph";
import { StatusEdge } from "@/components/builder/agent-structure/edges/status-edge";
import {
  AgentDrawer,
  GenericDrawer,
  IntegrationDrawer,
  TriggerDrawer,
} from "@/components/builder/agent-structure/drawers/structure-drawers";
import { buildProductAgentGraph } from "@/components/builder/agent-structure/graph-adapter";
import { layoutProductGraph } from "@/components/builder/agent-structure/product-graph-layout";
import { AgentNode } from "@/components/builder/agent-structure/nodes/agent-node";
import { AttachmentNode } from "@/components/builder/agent-structure/nodes/attachment-node";
import { IntegrationNode } from "@/components/builder/agent-structure/nodes/integration-node";
import { OutputNode } from "@/components/builder/agent-structure/nodes/output-node";
import { TriggerNode } from "@/components/builder/agent-structure/nodes/trigger-node";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { lookupIntegrationAppIcons } from "@/lib/actions/integrations";
import { useAgent } from "@/hooks/use-agents";
import type { ExecutionVisualState } from "@/lib/domain/execution-state";
import type { ProductNode } from "@/lib/domain/product-agent-graph";
import type { AgentSpec, ApprovalMode, GraphSpec } from "@/lib/domain/types";
import { cacheIntegrationIcon, getCachedIntegrationIcon } from "@/lib/integrations/icon-resolver";
import { formatScheduleSummary, parseScheduleCron } from "@/lib/schedule-cron";

const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  output: OutputNode,
  attachment: AttachmentNode,
  integration: IntegrationNode,
};

const edgeTypes = {
  status: StatusEdge,
};

const EMPTY_LEGACY: ExecutionVisualState["legacy"] = {};

/** Resolve the error banner payload for a selected structure node (all agents/tools). */
function errorForSelectedNode(
  selected: ProductNode | null | undefined,
  executionVisual: ExecutionVisualState | null | undefined,
): ExecutionVisualState["error"] {
  if (!selected?.id || !executionVisual) return null;
  const fromNode = executionVisual.nodeErrors?.[selected.id];
  if (fromNode) return fromNode;
  if (
    executionVisual.error &&
    executionVisual.error.nodeId === selected.id
  ) {
    return executionVisual.error;
  }
  return null;
}

export interface ProductAgentGraphProps {
  agentId: string;
  spec: AgentSpec | null | undefined;
  graph?: GraphSpec | null;
  connections?: AgentConnectionInfo[];
  bindings?: AgentBindingInfo[];
  toolApprovals?: Record<string, ApprovalMode | string>;
  boundToolIds?: Set<string>;
  boundProviders?: Set<string>;
  boundAppIds?: Set<string>;
  modelStatus?: string;
  memoryStatus?: string;
  executionVisual?: ExecutionVisualState;
  onConnectionsChanged?: () => void;
  onConfigChanged?: () => void;
  /**
   * Structure locked (no definition edits). Installation config drawers can still
   * open when `allowInstallationConfig` is true (public subscribers).
   */
  readOnly?: boolean;
  /** Allow connecting tools / model / memory for this user's installation. */
  allowInstallationConfig?: boolean;
}

export function ProductAgentGraph(props: ProductAgentGraphProps) {
  return (
    <ReactFlowProvider>
      <ProductAgentGraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function FitViewOnLayout({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.36, duration: 180, minZoom: 0.32, maxZoom: 1.1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, signature]);
  return null;
}

function ProductAgentGraphCanvas({
  agentId,
  spec,
  graph,
  connections = [],
  bindings = [],
  toolApprovals,
  boundToolIds,
  boundProviders,
  boundAppIds,
  modelStatus,
  memoryStatus,
  executionVisual,
  onConnectionsChanged,
  onConfigChanged,
  readOnly = false,
  allowInstallationConfig = false,
}: ProductAgentGraphProps) {
  const { t } = useTranslation("structure");
  const { data: agent } = useAgent(agentId);
  const agentPublished = agent?.status === "published";
  const canConfigure = !readOnly || allowInstallationConfig;
  const [selected, setSelected] = useState<ProductNode | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const legacyMap = executionVisual?.legacy ?? EMPTY_LEGACY;
  /** After a successful run, fade greens back to idle after a few seconds. Errors stay. */
  const successKey =
    executionVisual?.runStatus === "success"
      ? Object.entries(legacyMap)
          .map(([k, v]) => `${k}:${v}`)
          .sort()
          .join("|") || "success"
      : null;
  const [fadedKeys, setFadedKeys] = useState(() => new Set<string>());
  const [pipedreamIcons, setPipedreamIcons] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!successKey) return;
    const timer = window.setTimeout(() => {
      setFadedKeys((prev) => {
        if (prev.has(successKey)) return prev;
        const next = new Set(prev);
        next.add(successKey);
        return next;
      });
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [successKey]);

  const fadeSuccess = successKey !== null && fadedKeys.has(successKey);

  const mapExecStatus = useCallback(
    (status?: string) => {
      if (!status || status === "idle") return undefined;
      if (fadeSuccess && status === "success") return "idle";
      return status;
    },
    [fadeSuccess],
  );

  const productGraph = useMemo(
    () => {
      const schedule = (spec?.triggers ?? []).find(
        (t) => t.kind === "schedule" && t.enabled,
      );
      const dayLabels = {
        mon: t("panel.dayMon"),
        tue: t("panel.dayTue"),
        wed: t("panel.dayWed"),
        thu: t("panel.dayThu"),
        fri: t("panel.dayFri"),
        sat: t("panel.daySat"),
        sun: t("panel.daySun"),
        every: t("panel.dayEvery"),
      };
      const timing = schedule
        ? parseScheduleCron(schedule.cron, schedule.timezone)
        : null;
      return buildProductAgentGraph({
        definition: spec,
        graph,
        boundToolIds,
        boundProviders,
        boundAppIds,
        modelStatus: modelStatus as never,
        memoryStatus: memoryStatus as never,
        scheduleSummary: timing ? formatScheduleSummary(timing, dayLabels) : undefined,
      });
    },
    [spec, graph, boundToolIds, boundProviders, boundAppIds, modelStatus, memoryStatus, t],
  );

  const layoutSignature = useMemo(
    () => productGraph.nodes.map((n) => n.id).join("|"),
    [productGraph.nodes],
  );

  const integrationAppKeySignature = useMemo(
    () =>
      productGraph.nodes
        .filter((n) => n.kind === "integration" || n.kind === "trigger_tool")
        .map((n) => n.integration?.appKey)
        .filter((key): key is string => Boolean(key))
        .sort()
        .join("|"),
    [productGraph.nodes],
  );

  useEffect(() => {
    if (!integrationAppKeySignature) return;
    const keys = integrationAppKeySignature.split("|");
    const missing = keys.filter((key) => !getCachedIntegrationIcon(key));
    if (missing.length === 0) return;
    let cancelled = false;
    void lookupIntegrationAppIcons(missing)
      .then((icons) => {
        if (cancelled) return;
        if (Object.keys(icons).length === 0) return;
        for (const [appKey, src] of Object.entries(icons)) {
          cacheIntegrationIcon(appKey, src);
        }
        setPipedreamIcons((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [appKey, src] of Object.entries(icons)) {
            if (src && next[appKey] !== src) {
              next[appKey] = src;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [integrationAppKeySignature]);

  const needsSetup = useMemo(
    () =>
      productGraph.nodes.filter(
        (n) =>
          n.configurationStatus === "setup_required" &&
          (n.kind === "integration" || n.kind === "model"),
      ),
    [productGraph.nodes],
  );

  useEffect(() => {
    const laidOut = layoutProductGraph(productGraph);
    const productById = new Map(productGraph.nodes.map((n) => [n.id, n]));

    setNodes(
      laidOut.nodes.map((node) => {
        const productNode =
          productById.get(node.id) ??
          (node.data as { productNode: ProductNode }).productNode;
        const appKey = productNode.integration?.appKey ?? "";
        const rawExec =
          executionVisual?.nodes?.[productNode.id]?.executionStatus ??
          executionVisual?.legacy?.[productNode.id];
        return {
          ...node,
          position: positionsRef.current[node.id] ?? node.position,
          data: {
            productNode,
            executionStatus: mapExecStatus(rawExec),
            selected: selected?.id === productNode.id,
            imgSrc:
              pipedreamIcons[appKey] ??
              getCachedIntegrationIcon(appKey) ??
              null,
          },
        };
      }),
    );

    setEdges(
      productGraph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: "status",
        selectable: false,
        focusable: false,
        zIndex: 0,
        data: {
          style: edge.style,
          executionStatus: mapExecStatus(
            executionVisual?.edges?.[edge.id]?.executionStatus,
          ),
        },
      })),
    );
  }, [productGraph, executionVisual, selected?.id, setEdges, setNodes, mapExecStatus, pipedreamIcons]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === "position" && change.position && change.id) {
          positionsRef.current[change.id] = change.position;
        }
      }
    },
    [onNodesChange],
  );

  const modelNode = productGraph.nodes.find((n) => n.kind === "model");
  const integrationCount = productGraph.nodes.filter((n) => n.kind === "integration").length;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {needsSetup.length > 0 ? (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
              <Link2 className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium">{t("modules.setupBanner.title")}</p>
              <p className="text-xs text-muted-foreground">{t("modules.setupBanner.body")}</p>
              <div className="flex flex-wrap gap-1.5">
                {needsSetup.map((node) => (
                  <Button
                    key={node.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full border-amber-500/35 bg-background/80 text-xs"
                    onClick={() => setSelected(node)}
                  >
                    {node.label}
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
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.32, minZoom: 0.35, maxZoom: 1.15 }}
          minZoom={0.3}
          maxZoom={1.6}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          selectNodesOnDrag={false}
          panOnDrag
          zoomOnScroll
          nodeDragThreshold={8}
          defaultEdgeOptions={{ type: "status" }}
          proOptions={{ hideAttribution: true }}
          className="structure-agent-flow h-full w-full"
          onNodeClick={(_, node) => {
            const pn = (node.data as { productNode?: ProductNode; executionStatus?: ProductNode["executionStatus"] })
              ?.productNode;
            if (!pn) return;
            const exec = (node.data as { executionStatus?: ProductNode["executionStatus"] })
              ?.executionStatus;
            setSelected(exec ? { ...pn, executionStatus: exec } : pn);
          }}
        >
          <Background gap={22} size={1.2} color="#c4c4c8" />
          <Controls showInteractive={false} className="!rounded-xl" />
          <FitViewOnLayout signature={layoutSignature} />
        </ReactFlow>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/80 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
        {t("modules.clickHint")}
      </p>

      <IntegrationDrawer
        open={canConfigure && selected?.kind === "integration"}
        onOpenChange={(open) => !open && setSelected(null)}
        node={selected}
        agentId={agentId}
        connections={connections}
        bindings={bindings}
        onConnectionsChanged={onConnectionsChanged}
        executionError={errorForSelectedNode(selected, executionVisual)}
      />
      <AgentDrawer
        open={!readOnly && selected?.kind === "agent"}
        onOpenChange={(open) => !open && setSelected(null)}
        node={selected}
        agentId={agentId}
        spec={spec}
        modelSubtitle={modelNode?.subtitle}
        integrationCount={integrationCount}
        executionError={executionVisual?.error ?? null}
        published={agentPublished}
        onSaved={onConfigChanged}
      />
      <TriggerDrawer
        open={
          !readOnly &&
          (selected?.kind === "trigger_chat" ||
            selected?.kind === "trigger_schedule" ||
            selected?.kind === "trigger_tool")
        }
        onOpenChange={(open) => !open && setSelected(null)}
        node={selected}
        agentId={agentId}
        spec={spec}
        connections={connections}
        published={agentPublished}
        onSaved={onConfigChanged}
        onConnectionsChanged={onConnectionsChanged}
      />
      <GenericDrawer
        open={
          canConfigure &&
          selected !== null &&
          selected.kind !== "integration" &&
          selected.kind !== "agent" &&
          !selected.kind.startsWith("trigger")
        }
        onOpenChange={(open) => !open && setSelected(null)}
        node={selected}
        agentId={agentId}
        spec={spec}
        onSaved={onConfigChanged}
        executionError={errorForSelectedNode(selected, executionVisual)}
      />
    </div>
  );
}
