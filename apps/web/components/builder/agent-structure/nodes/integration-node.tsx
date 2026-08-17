"use client";

import { Position, type Node, type NodeProps } from "@xyflow/react";

import {
  HiddenHandle,
  NodeFrame,
  displayStatus,
} from "@/components/builder/agent-structure/node-styles";
import type { ProductNodeData } from "@/components/builder/agent-structure/nodes/agent-node";
import { StructureAppIcon } from "@/components/builder/agent-structure/structure-icon";
import { cn } from "@/lib/utils";

export function IntegrationNode({ data }: NodeProps<Node<ProductNodeData>>) {
  const node = data.productNode;
  const status = String(displayStatus(node, data.executionStatus as never));
  const appKey = node.integration?.appKey ?? node.id;

  return (
    <NodeFrame selected={data.selected} className="w-[112px]">
      <HiddenHandle type="source" position={Position.Left} id="out" style={{ top: 46 }} />
      <StructureAppIcon
        appKey={appKey}
        status={status}
        imgSrc={typeof data.imgSrc === "string" ? data.imgSrc : null}
        className={cn(data.selected && "rounded-full ring-2 ring-brand/45")}
      />
      <p className="mt-1.5 max-w-[112px] truncate text-xs font-medium leading-tight">
        {node.label}
      </p>
    </NodeFrame>
  );
}
