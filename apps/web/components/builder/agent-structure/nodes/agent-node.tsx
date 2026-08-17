"use client";

import { Position, type Node, type NodeProps } from "@xyflow/react";

import {
  HiddenHandle,
  NodeFrame,
  displayStatus,
} from "@/components/builder/agent-structure/node-styles";
import {
  StructureKindIcon,
  statusToTone,
  toneBorderColor,
} from "@/components/builder/agent-structure/structure-icon";
import type { ProductNode } from "@/lib/domain/product-agent-graph";

export interface ProductNodeData extends Record<string, unknown> {
  productNode: ProductNode;
  executionStatus?: string;
  selected?: boolean;
  imgSrc?: string | null;
}

export function AgentNode({ data }: NodeProps<Node<ProductNodeData>>) {
  const node = data.productNode;
  const status = String(displayStatus(node, data.executionStatus as never));
  const tone = statusToTone(status);
  const border = toneBorderColor(tone, status);

  return (
    <NodeFrame selected={data.selected} className="relative w-[172px]">
      <HiddenHandle
        type="target"
        position={Position.Top}
        id="agent-input"
        style={{ left: "50%", top: 0, transform: "translate(-50%, -50%)" }}
      />
      <HiddenHandle
        type="source"
        position={Position.Bottom}
        id="agent-output"
        style={{ left: "50%", bottom: 0, top: "auto", transform: "translate(-50%, 50%)" }}
      />
      <HiddenHandle
        type="target"
        position={Position.Left}
        id="agent-model"
        style={{ top: "34%" }}
      />
      <HiddenHandle
        type="target"
        position={Position.Left}
        id="agent-memory"
        style={{ top: "66%" }}
      />
      <HiddenHandle type="target" position={Position.Right} id="agent-tools" />
      <div
        className="structure-shape flex min-h-[236px] w-[172px] flex-col items-center justify-start gap-3.5 rounded-2xl bg-[var(--structure-node-fill)] px-3.5 pb-5 pt-6 shadow-sm"
        style={{ border: `2px solid ${border}` }}
      >
        <StructureKindIcon kind="agent" status={status} className="size-[76px]" />
        <div className="space-y-1 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
            {node.label}
          </p>
          <p className="text-[15px] font-semibold leading-snug">{node.agentName || "Agent"}</p>
        </div>
      </div>
    </NodeFrame>
  );
}
