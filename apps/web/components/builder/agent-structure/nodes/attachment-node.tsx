"use client";

import { Position, type Node, type NodeProps } from "@xyflow/react";

import {
  HiddenHandle,
  NodeFrame,
  displayStatus,
} from "@/components/builder/agent-structure/node-styles";
import type { ProductNodeData } from "@/components/builder/agent-structure/nodes/agent-node";
import { StructureCircleNode } from "@/components/builder/agent-structure/structure-icon";

export function AttachmentNode({ data }: NodeProps<Node<ProductNodeData>>) {
  const node = data.productNode;
  const status = String(displayStatus(node, data.executionStatus as never));

  return (
    <NodeFrame selected={data.selected} className="w-[112px]">
      <HiddenHandle type="source" position={Position.Right} id="out" style={{ top: 50 }} />
      <StructureCircleNode
        kind={node.kind}
        status={status}
        label={node.label}
        selected={data.selected}
      />
    </NodeFrame>
  );
}
