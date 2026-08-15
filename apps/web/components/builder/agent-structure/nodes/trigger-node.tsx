"use client";

import { Position, type Node, type NodeProps } from "@xyflow/react";

import {
  HiddenHandle,
  SquareCard,
  displayStatus,
} from "@/components/builder/agent-structure/node-styles";
import type { ProductNodeData } from "@/components/builder/agent-structure/nodes/agent-node";
import { StructureKindIcon } from "@/components/builder/agent-structure/structure-icon";

export function TriggerNode({ data }: NodeProps<Node<ProductNodeData>>) {
  const node = data.productNode;
  const status = String(displayStatus(node, data.executionStatus as never));

  return (
    <div className="relative h-[118px] w-[118px]">
      <HiddenHandle
        type="source"
        position={Position.Bottom}
        id="out"
        style={{ left: "50%", bottom: 0, top: "auto", transform: "translate(-50%, 50%)" }}
      />
      <SquareCard selected={data.selected} status={status} className="h-full w-full">
        <StructureKindIcon kind={node.kind} status={status} className="size-14" />
        <p className="text-sm font-medium">{node.label}</p>
      </SquareCard>
    </div>
  );
}
