"use client";

import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowRightLeft,
  BookOpen,
  Bot,
  Brain,
  CircleDot,
  GitBranch,
  Hammer,
  LogIn,
  LogOut,
  Shield,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/use-translation";
import type { GraphNode, GraphNodeType, GraphSpec } from "@/lib/domain/types";
import { setPrefillDraft } from "@/lib/pending-prompt";
import { cn } from "@/lib/utils";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;

interface StructureNodeData extends Record<string, unknown> {
  label: string;
  nodeType: GraphNodeType;
  description: string;
  config: Record<string, unknown>;
  selected?: boolean;
  onSelect?: () => void;
}

const NODE_ICONS: Record<GraphNodeType, React.ComponentType<{ className?: string }>> = {
  input: LogIn,
  guardrail: Shield,
  llm: Brain,
  router: GitBranch,
  tool: Wrench,
  knowledge: BookOpen,
  memory_read: CircleDot,
  memory_write: CircleDot,
  approval: Shield,
  transform: ArrowRightLeft,
  sub_agent: Bot,
  output: LogOut,
};

function StructureNodeCard({ data }: NodeProps<Node<StructureNodeData>>) {
  const { t } = useTranslation("structure");
  const Icon = NODE_ICONS[data.nodeType] ?? CircleDot;
  const label = t(`nodes.${data.nodeType}`, { defaultValue: data.label });

  return (
    <button
      type="button"
      className={cn(
        "glass flex w-[180px] items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2.5 text-left",
        "transition-colors hover:border-brand/40 hover:bg-brand/5",
        data.selected && "border-brand/50 ring-1 ring-brand/30",
      )}
      onClick={() => data.onSelect?.()}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground/40" />
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{data.label}</span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">
          {label}
        </span>
      </span>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground/40" />
    </button>
  );
}

const nodeTypes = { structure: StructureNodeCard };

function layoutGraph(spec: GraphSpec): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 64, marginx: 24, marginy: 24 });

  for (const node of spec.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of spec.edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  const nodes: Node<StructureNodeData>[] = spec.nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: "structure",
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        label: node.name,
        nodeType: node.type,
        description: node.description ?? "",
        config: node.config ?? {},
      },
    };
  });

  const edges: Edge[] = spec.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: false,
    style: { stroke: "hsl(var(--muted-foreground) / 0.35)" },
  }));

  return { nodes, edges };
}

interface StructureGraphProps {
  agentId: string;
  graph: GraphSpec;
}

export function StructureGraph({ agentId, graph }: StructureGraphProps) {
  const { t } = useTranslation("structure");
  const router = useRouter();
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutGraph(graph),
    [graph],
  );

  const nodesWithHandlers = useMemo(
    () =>
      initialNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          selected: selected?.id === node.id,
          onSelect: () => {
            const source = graph.nodes.find((n) => n.id === node.id);
            if (source) {
              setSelected(source);
              setSheetOpen(true);
            }
          },
        },
      })),
    [initialNodes, graph.nodes, selected?.id],
  );

  const goToBuild = () => {
    setPrefillDraft(t("prefill.graph"));
    router.push(`/agents/${agentId}/build`);
    setSheetOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="glass h-[min(520px,60vh)] overflow-hidden rounded-3xl">
        <ReactFlow
          nodes={nodesWithHandlers}
          edges={initialEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="hsl(var(--muted-foreground) / 0.08)" />
          <Controls showInteractive={false} className="!glass !rounded-xl !border-border" />
          <MiniMap
            className="!glass !rounded-xl !border-border"
            nodeColor={() => "hsl(var(--brand) / 0.35)"}
            maskColor="hsl(var(--background) / 0.65)"
          />
        </ReactFlow>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="glass w-full sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>{t(`nodes.${selected.type}`)}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 px-1">
                {selected.description ? (
                  <p className="text-sm leading-relaxed text-foreground/85">{selected.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("nodeStates.default")}</p>
                )}
                {selected.type === "tool" && selected.config?.tool_id ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    {t("nodeStates.toolId", { id: String(selected.config.tool_id) })}
                  </p>
                ) : null}
                {selected.type === "llm" && selected.config?.profile ? (
                  <p className="text-sm text-muted-foreground">
                    {t("nodeStates.modelProfile", { profile: String(selected.config.profile) })}
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
