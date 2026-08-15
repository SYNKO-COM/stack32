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
import type { ExecutionVisualState } from "@/lib/domain/execution-state";
import type { ProductNode } from "@/lib/domain/product-agent-graph";
import type { AgentSpec, ApprovalMode, GraphSpec } from "@/lib/domain/types";
import { useTranslation } from "@/hooks/use-translation";

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

export interface ProductAgentGraphProps {
  agentId: string;
  spec: AgentSpec | null | undefined;
  graph?: GraphSpec | null;
  connections?: AgentConnectionInfo[];
  bindings?: AgentBindingInfo[];
  toolApprovals?: Record<string, ApprovalMode | string>;
  boundToolIds?: Set<string>;
  boundProviders?: Set<string>;
  modelStatus?: string;
  memoryStatus?: string;
  executionVisual?: ExecutionVisualState;
  onConnectionsChanged?: () => void;
  onConfigChanged?: () => void;
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
  modelStatus,
  memoryStatus,
  executionVisual,
  onConnectionsChanged,
  onConfigChanged,
}: ProductAgentGraphProps) {
  const { t } = useTranslation("structure");
  const [selected, setSelected] = useState<ProductNode | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  /** After a successful run, fade greens back to idle (orange) after a few seconds. Errors stay. */
  const [fadeSuccess, setFadeSuccess] = useState(false);

  useEffect(() => {
    if (executionVisual?.runStatus === "success") {
      setFadeSuccess(false);
      const timer = window.setTimeout(() => setFadeSuccess(true), 8_000);
      return () => window.clearTimeout(timer);
    }
    setFadeSuccess(false);
    return undefined;
  }, [executionVisual?.runStatus]);

  const mapExecStatus = useCallback(
    (status?: string) => {
      if (!status || status === "idle") return undefined;
      if (fadeSuccess && status === "success") return "idle";
      return status;
    },
    [fadeSuccess],
  );

  const productGraph = useMemo(
    () =>
      buildProductAgentGraph({
        definition: spec,
        graph,
        boundToolIds,
        boundProviders,
        modelStatus: modelStatus as never,
        memoryStatus: memoryStatus as never,
      }),
    [spec, graph, boundToolIds, boundProviders, modelStatus, memoryStatus],
  );

  const layoutSignature = useMemo(
    () => productGraph.nodes.map((n) => n.id).join("|"),
    [productGraph.nodes],
  );

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
        const rawExec =
          executionVisual?.nodes[productNode.id]?.executionStatus ??
          executionVisual?.legacy[productNode.id];
        return {
          ...node,
          position: positionsRef.current[node.id] ?? node.position,
          data: {
            productNode,
            executionStatus: mapExecStatus(rawExec),
            selected: selected?.id === productNode.id,
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
            executionVisual?.edges[edge.id]?.executionStatus,
          ),
        },
      })),
    );
  }, [productGraph, executionVisual, selected?.id, setEdges, setNodes, mapExecStatus]);

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
            const pn = (node.data as { productNode?: ProductNode })?.productNode;
            if (pn) setSelected(pn);
          }}
        >
          <Background gap={22} size={1.2} color="#c4c4c8" />
          <Controls showInteractive={false} className="!rounded-xl !border-border !bg-background/90" />
          <FitViewOnLayout signature={layoutSignature} />
        </ReactFlow>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/80 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
        {t("modules.clickHint")}
      </p>

      <IntegrationDrawer
        open={selected?.kind === "integration"}
        onOpenChange={(open) => !open && setSelected(null)}
        node={selected}
        agentId={agentId}
        connections={connections}
        bindings={bindings}
        toolApprovals={toolApprovals}
        onConnectionsChanged={onConnectionsChanged}
      />
      <AgentDrawer
        open={selected?.kind === "agent"}
        onOpenChange={(open) => !open && setSelected(null)}
        node={selected}
        modelSubtitle={modelNode?.subtitle}
        integrationCount={integrationCount}
      />
      <TriggerDrawer
        open={selected?.kind === "trigger_chat" || selected?.kind === "trigger_schedule"}
        onOpenChange={(open) => !open && setSelected(null)}
        node={selected}
      />
      <GenericDrawer
        open={
          selected !== null &&
          selected.kind !== "integration" &&
          selected.kind !== "agent" &&
          !selected.kind.startsWith("trigger")
        }
        onOpenChange={(open) => !open && setSelected(null)}
        node={selected}
        agentId={agentId}
        onSaved={onConfigChanged}
      />
    </div>
  );
}
