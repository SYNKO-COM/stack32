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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";

import { StatusEdge } from "@/components/builder/agent-structure/edges/status-edge";
import { buildProductAgentGraph } from "@/components/builder/agent-structure/graph-adapter";
import { AgentNode } from "@/components/builder/agent-structure/nodes/agent-node";
import { AttachmentNode } from "@/components/builder/agent-structure/nodes/attachment-node";
import { IntegrationNode } from "@/components/builder/agent-structure/nodes/integration-node";
import { OutputNode } from "@/components/builder/agent-structure/nodes/output-node";
import { TriggerNode } from "@/components/builder/agent-structure/nodes/trigger-node";
import { layoutProductGraph } from "@/components/builder/agent-structure/product-graph-layout";
import { useCurrentUser } from "@/hooks/use-auth";
import { useAgentGraph, useAgentSpec } from "@/hooks/use-agents";
import { useTranslation } from "@/hooks/use-translation";
import type { ProductAgentGraph, ProductEdge, ProductNode } from "@/lib/domain/product-agent-graph";
import type { PublicAgentDto } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

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

function FitViewOnce({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.32, duration: 220, minZoom: 0.35, maxZoom: 1.05 });
    });
    return () => cancelAnimationFrame(id);
  }, [fitView, signature]);
  return null;
}

function lockNodes(nodes: Node[]): Node[] {
  return nodes.map((node) => ({
    ...node,
    draggable: false,
    selectable: false,
    focusable: false,
  }));
}

function toStatusEdges(edges: ProductEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: "status",
    selectable: false,
    focusable: false,
    // Vitrine: always default edge color — no run/setup status colors.
    data: { style: edge.style, executionStatus: undefined },
  }));
}

/** Landing showcase only: idle/ready visuals, no setup warnings or exec colors. */
function toShowcaseGraph(graph: ProductAgentGraph): ProductAgentGraph {
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      configurationStatus: "ready",
      executionStatus: undefined,
      integration: node.integration
        ? {
            ...node.integration,
            configurationStatus: "ready",
            connectionStatus: "ready",
          }
        : undefined,
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      configurationStatus: undefined,
      executionStatus: undefined,
    })),
  };
}

function buildSyntheticGraph(
  agent: PublicAgentDto,
  labels: { chat: string; model: string; memory: string; output: string },
): ProductAgentGraph {
  const modules = agent.modules ?? [];
  const nodes: ProductNode[] = [
    {
      id: "preview-chat",
      kind: "trigger_chat",
      label: labels.chat,
      configurationStatus: "ready",
    },
    {
      id: "preview-agent",
      kind: "agent",
      label: agent.name,
      agentName: agent.name,
      configurationStatus: "ready",
    },
    {
      id: "preview-model",
      kind: "model",
      label: labels.model,
      configurationStatus: "ready",
    },
    {
      id: "preview-memory",
      kind: "memory",
      label: labels.memory,
      configurationStatus: "ready",
    },
    {
      id: "preview-output",
      kind: "output",
      label: labels.output,
      configurationStatus: "ready",
    },
    ...modules.slice(0, 8).map((mod, i) => ({
      id: `preview-mod-${i}`,
      kind: "integration" as const,
      label: mod.label,
      configurationStatus: "ready" as const,
      integration: {
        appKey: mod.label.toLowerCase().replace(/\s+/g, "_"),
        appName: mod.label,
        provider: "preview",
        toolIds: [],
        actions: [],
        connectionStatus: "ready",
        configurationStatus: "ready" as const,
      },
    })),
  ];

  const edges: ProductEdge[] = [
    {
      id: "e-chat-agent",
      source: "preview-chat",
      target: "preview-agent",
      style: "solid",
      role: "main",
    },
    {
      id: "e-agent-out",
      source: "preview-agent",
      target: "preview-output",
      style: "solid",
      role: "main",
    },
    {
      id: "e-model-agent",
      source: "preview-model",
      target: "preview-agent",
      style: "dashed",
      role: "attachment",
    },
    {
      id: "e-memory-agent",
      source: "preview-memory",
      target: "preview-agent",
      style: "dashed",
      role: "attachment",
    },
    ...modules.slice(0, 8).map((_, i) => ({
      id: `e-mod-${i}`,
      source: "preview-agent",
      target: `preview-mod-${i}`,
      style: "solid" as const,
      role: "main" as const,
    })),
  ];

  return { nodes, edges };
}

function PreviewCanvas({
  agent,
  className,
}: {
  agent: PublicAgentDto;
  className?: string;
}) {
  const { t } = useTranslation(["common", "structure"]);
  const { data: user } = useCurrentUser();
  const canFetch = Boolean(user);

  const { data: spec } = useAgentSpec(canFetch ? agent.agentId : "");
  const { data: graphResponse } = useAgentGraph(canFetch ? agent.agentId : "");

  const { flowNodes, flowEdges, signature } = useMemo(() => {
    const productRaw =
      canFetch && spec
        ? buildProductAgentGraph({
            definition: spec,
            graph: graphResponse?.graph ?? null,
            boundToolIds: new Set(),
            boundProviders: new Set(),
            boundAppIds: new Set(),
            modelStatus: "ready",
            memoryStatus: "ready",
          })
        : buildSyntheticGraph(agent, {
            chat: t("structure:modules.kinds.trigger"),
            model: t("structure:modules.kinds.model"),
            memory: t("structure:modules.kinds.memory"),
            output: t("structure:modules.kinds.output"),
          });

    // Public landing is a shop window — never show setup/run status chrome here.
    const product = toShowcaseGraph(productRaw);
    const laid = layoutProductGraph(product);
    return {
      flowNodes: lockNodes(laid.nodes),
      flowEdges: toStatusEdges(product.edges),
      signature: `${canFetch && spec ? "spec" : "synth"}:${agent.agentId}:${product.nodes.map((n) => n.id).join(",")}`,
    };
  }, [agent, canFetch, graphResponse?.graph, spec, t]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowEdges, flowNodes, setEdges, setNodes]);

  return (
    <div className={cn("relative h-full min-h-[320px] w-full", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        preventScrolling
        minZoom={0.3}
        maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        <Background gap={22} size={1.1} color="#c4c4c8" />
        <Controls showInteractive={false} className="!rounded-xl" />
        <FitViewOnce signature={signature} />
      </ReactFlow>
      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
        {t("common:publicAgent.structurePreviewHint")}
      </p>
    </div>
  );
}

/** Read-only structure canvas for the public landing — pan/zoom only. */
export function PublicAgentStructurePreview({
  agent,
  className,
}: {
  agent: PublicAgentDto;
  className?: string;
}) {
  return (
    <ReactFlowProvider>
      <PreviewCanvas agent={agent} className={className} />
    </ReactFlowProvider>
  );
}
