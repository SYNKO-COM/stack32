"use client";

import { Background, ReactFlow, ReactFlowProvider, getBezierPath, useReactFlow, type Edge, type EdgeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import { buildProductAgentGraph } from "@/components/builder/agent-structure/graph-adapter";
import { layoutProductGraph } from "@/components/builder/agent-structure/product-graph-layout";
import { AgentNode } from "@/components/builder/agent-structure/nodes/agent-node";
import { AttachmentNode } from "@/components/builder/agent-structure/nodes/attachment-node";
import { IntegrationNode } from "@/components/builder/agent-structure/nodes/integration-node";
import { OutputNode } from "@/components/builder/agent-structure/nodes/output-node";
import { TriggerNode } from "@/components/builder/agent-structure/nodes/trigger-node";
import type { PreparedSpec } from "@/lib/actions/mobile-onboarding";
import { specFromDb } from "@/lib/domain/mappers";
import type { Json } from "@/lib/supabase/database.types";

const nodeTypes = { trigger: TriggerNode, agent: AgentNode, output: OutputNode, attachment: AttachmentNode, integration: IntegrationNode };
function DrawingEdge(props: EdgeProps) {
  const [path] = getBezierPath(props);
  return <path d={path} pathLength={1} fill="none" stroke="var(--structure-edge)" strokeWidth={1.85} className="journey-preview-line" />;
}
const edgeTypes = { drawing: DrawingEdge };
function Fit({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => void fitView({ padding: .12, minZoom: .12, maxZoom: .85, duration: 0 }));
    return () => cancelAnimationFrame(frame);
  }, [fitView, signature]);
  return null;
}
function Canvas({ spec, progress }: { spec: PreparedSpec; progress: number }) {
  const reduced = useReducedMotion();
  const { nodes, edges, signature } = useMemo(() => {
    // Use the same stored-spec mapper, product adapter, node renderers and layout
    // as Structure. No invented tool, connection or successful execution state.
    const definition = specFromDb(spec as unknown as Json, spec.identity.name);
    const product = buildProductAgentGraph({ definition, graph: definition.graph, modelStatus: definition.model ? "ready" : "setup_required" });
    const layout = layoutProductGraph(product);
    const order = ["trigger", "agent", "attachment", "integration", "output"];
    const sorted = [...layout.nodes].sort((a, b) => order.indexOf(a.type!) - order.indexOf(b.type!));
    const count = Math.max(1, Math.ceil(Math.min(1, progress / 100) * sorted.length));
    const visible = new Set(sorted.slice(0, count).map(n => n.id));
    const nodes = layout.nodes.map(node => ({ ...node, hidden: false, draggable: false, selectable: false, focusable: false, className: `${node.className} ${visible.has(node.id) ? "journey-preview-node" : ""}`, style: { ...node.style, animationDelay: progress >= 100 ? `${sorted.findIndex(n => n.id === node.id) * 110}ms` : "0ms", opacity: visible.has(node.id) ? 1 : 0, pointerEvents: "none" as const } }));
    const edges: Edge[] = product.edges.filter(e => visible.has(e.source) && visible.has(e.target)).map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: "drawing", selectable: false, focusable: false }));
    return { nodes, edges, signature: `${layout.nodes.map(n => n.id).join("|")}:${Boolean(reduced)}` };
  }, [spec, progress, reduced]);
  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} panOnScroll={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false} minZoom={.12} maxZoom={.85} fitView fitViewOptions={{ padding: .12, minZoom: .12, maxZoom: .85 }} proOptions={{ hideAttribution: true }} className="structure-agent-flow !bg-transparent"><Background gap={22} size={1} color="#c4c4c8" /><Fit signature={signature} /></ReactFlow>;
}
export function PreparedAgentPreview({ spec, progress = 100 }: { spec: PreparedSpec; progress?: number }) {
  return <div className="mt-5 h-[280px] overflow-hidden rounded-3xl border border-border bg-background/70 sm:h-[340px]" data-testid="prepared-agent-structure" aria-label={`Structure de ${spec.identity.name}`}><ReactFlowProvider><Canvas spec={spec} progress={progress} /></ReactFlowProvider></div>;
}
