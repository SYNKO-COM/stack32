"use client";

import {
  Background,
  Handle,
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
  Play,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
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
import type { AgentModule, AgentModuleMap, ModuleKind } from "@/lib/domain/agent-modules";
import { setPrefillDraft } from "@/lib/pending-prompt";
import { cn } from "@/lib/utils";

const CHAIN_STEP_X = 210;
const CHAIN_Y = 40;
const ATTACHMENT_Y = 210;
const ATTACHMENT_STEP_X = 128;
const CHAIN_WIDTH = 168;
const ATTACHMENT_WIDTH = 108;

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

interface ModuleNodeData extends Record<string, unknown> {
  module: AgentModule;
  title: string;
  subtitle?: string;
  variant: "chain" | "attachment";
  isBrain: boolean;
  onSelect: () => void;
}

function ModuleNode({ data }: NodeProps<Node<ModuleNodeData>>) {
  const Icon = KIND_ICONS[data.module.kind] ?? Wrench;
  const isChain = data.variant === "chain";

  return (
    <button
      type="button"
      onClick={data.onSelect}
      className={cn(
        "glass flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 text-center transition-colors",
        "hover:border-brand/40 hover:bg-brand/5",
        isChain ? "w-[168px] px-3 py-3" : "w-[108px] px-2 py-2.5",
      )}
    >
      {isChain ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2 !border-0 !bg-muted-foreground/40"
        />
      ) : (
        <Handle
          type="target"
          position={Position.Top}
          className="!size-2 !border-0 !bg-muted-foreground/40"
        />
      )}

      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-brand/12 text-brand",
          isChain ? "size-9" : "size-7",
        )}
      >
        <Icon className={isChain ? "size-4.5" : "size-3.5"} aria-hidden="true" />
      </span>
      <span
        className={cn(
          "block max-w-full truncate font-medium",
          isChain ? "text-xs" : "text-[11px]",
        )}
      >
        {data.title}
      </span>
      {data.subtitle ? (
        <span className="block max-w-full truncate text-[10px] text-muted-foreground">
          {data.subtitle}
        </span>
      ) : null}

      {isChain ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2 !border-0 !bg-muted-foreground/40"
        />
      ) : null}
      {data.isBrain ? (
        <Handle
          id="capabilities"
          type="source"
          position={Position.Bottom}
          className="!size-2 !border-0 !bg-muted-foreground/40"
        />
      ) : null}
    </button>
  );
}

const nodeTypes = { module: ModuleNode };

export function AgentModuleGraph({
  agentId,
  modules,
}: {
  agentId: string;
  modules: AgentModuleMap;
}) {
  const { t } = useTranslation("structure");
  const router = useRouter();
  const [selected, setSelected] = useState<AgentModule | null>(null);

  const label = (module: AgentModule): string =>
    module.label?.trim() || t(`modules.kinds.${module.kind}`);

  const subtitle = (module: AgentModule): string | undefined => {
    if (module.kind === "tool" && module.toolId) {
      return t(`tools.${module.toolId}`, { defaultValue: module.toolId });
    }
    return module.detail;
  };

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
        onSelect: () => setSelected(module),
      },
    }));

    // Center the capability row under the brain node, n8n style.
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
          onSelect: () => setSelected(module),
        },
      }),
    );

    const chainEdges: Edge[] = modules.chain.slice(1).map((module, index) => ({
      id: `edge-${modules.chain[index].id}-${module.id}`,
      source: `chain-${modules.chain[index].id}`,
      target: `chain-${module.id}`,
      style: { stroke: "hsl(var(--muted-foreground) / 0.35)" },
    }));

    const brainId = brainIndex >= 0 ? modules.chain[brainIndex]?.id : undefined;
    const attachmentEdges: Edge[] = brainId
      ? modules.attachments.map((module) => ({
          id: `edge-brain-${module.id}`,
          source: `chain-${brainId}`,
          sourceHandle: "capabilities",
          target: `attach-${module.id}`,
          style: { stroke: "hsl(var(--muted-foreground) / 0.3)", strokeDasharray: "4 4" },
        }))
      : [];

    return {
      nodes: [...chainNodes, ...attachmentNodes],
      edges: [...chainEdges, ...attachmentEdges],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels follow the i18n instance
  }, [modules, t]);

  const goToBuild = () => {
    setPrefillDraft(t("prefill.graph"));
    router.push(`/agents/${agentId}/build`);
    setSelected(null);
  };

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        className="h-full w-full"
      >
        <Background gap={22} size={1} color="hsl(var(--muted-foreground) / 0.1)" />
      </ReactFlow>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="glass w-full sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{label(selected)}</SheetTitle>
                <SheetDescription>{t(`modules.kinds.${selected.kind}`)}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 px-1">
                <p className="text-sm leading-relaxed text-foreground/85">
                  {selected.detail || t(`modules.help.${selected.kind}`)}
                </p>
                {selected.toolId ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    {t("nodeStates.toolId", { id: selected.toolId })}
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
    </>
  );
}
