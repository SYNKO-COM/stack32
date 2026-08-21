import type { Node } from "@xyflow/react";

import type { ProductAgentGraph, ProductEdge, ProductNode } from "@/lib/domain/product-agent-graph";

const FLOW_NODE_CLASS =
  "!bg-transparent !border-0 !p-0 !shadow-none !outline-none";

export const LAYOUT = {
  centerX: 460,
  agentY: 190,
  triggerY: 8,
  triggerSpread: 160,
  outputGap: 118,
  sideGap: 230,
  rightColGap: 158,
  rowGap: 158,
  nodeWidth: {
    trigger: 118,
    agent: 172,
    output: 118,
    attachment: 112,
    integration: 112,
  },
  agentHeight: 236,
} as const;

export function layoutProductGraph(graph: ProductAgentGraph): {
  nodes: Node[];
  edges: ProductEdge[];
} {
  const { centerX, agentY } = LAYOUT;
  const positioned: Node[] = [];

  const triggers = graph.nodes.filter(
    (n) =>
      n.kind === "trigger_chat" || n.kind === "trigger_schedule" || n.kind === "trigger_tool",
  );
  const agent = graph.nodes.find((n) => n.kind === "agent");
  const output = graph.nodes.find((n) => n.kind === "output");
  const leftAttachments = graph.nodes.filter((n) => n.kind === "model" || n.kind === "memory");
  const integrations = graph.nodes.filter((n) => n.kind === "integration");

  const agentX = centerX - LAYOUT.nodeWidth.agent / 2;
  const agentMidY = agentY + LAYOUT.agentHeight / 2;

  if (triggers.length === 1) {
    positioned.push(
      nodePosition(triggers[0], centerX - LAYOUT.nodeWidth.trigger / 2, LAYOUT.triggerY),
    );
  } else if (triggers.length === 2) {
    positioned.push(
      nodePosition(
        triggers[0],
        centerX - LAYOUT.triggerSpread - LAYOUT.nodeWidth.trigger / 2,
        LAYOUT.triggerY,
      ),
      nodePosition(
        triggers[1],
        centerX + LAYOUT.triggerSpread - LAYOUT.nodeWidth.trigger / 2,
        LAYOUT.triggerY,
      ),
    );
  } else if (triggers.length >= 3) {
    const gap = 148;
    const startX = centerX - gap - LAYOUT.nodeWidth.trigger / 2;
    triggers.slice(0, 3).forEach((node, index) => {
      positioned.push(nodePosition(node, startX + index * gap, LAYOUT.triggerY));
    });
  }

  if (agent) {
    positioned.push(nodePosition(agent, agentX, agentY));
  }

  if (output) {
    positioned.push(
      nodePosition(
        output,
        centerX - LAYOUT.nodeWidth.output / 2,
        agentY + LAYOUT.agentHeight + LAYOUT.outputGap,
      ),
    );
  }

  const leftX = agentX - LAYOUT.sideGap - LAYOUT.nodeWidth.attachment;
  const leftStartY =
    agentMidY - ((Math.max(leftAttachments.length, 1) - 1) * LAYOUT.rowGap) / 2 - 40;
  leftAttachments.forEach((node, index) => {
    positioned.push(nodePosition(node, leftX, leftStartY + index * LAYOUT.rowGap));
  });

  const columns = integrations.length <= 4 ? 1 : integrations.length <= 8 ? 2 : 3;
  const rightX = agentX + LAYOUT.nodeWidth.agent + LAYOUT.sideGap;
  const rows = Math.max(1, Math.ceil(integrations.length / columns));
  const rightStartY = agentMidY - ((rows - 1) * LAYOUT.rowGap) / 2 - 40;
  integrations.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    positioned.push(
      nodePosition(
        node,
        rightX + col * LAYOUT.rightColGap,
        rightStartY + row * LAYOUT.rowGap,
      ),
    );
  });

  return { nodes: positioned, edges: graph.edges };
}

function nodePosition(node: ProductNode, x: number, y: number): Node {
  const type =
    node.kind === "agent"
      ? "agent"
      : node.kind === "output"
        ? "output"
        : node.kind === "integration"
          ? "integration"
          : node.kind === "trigger_chat" ||
              node.kind === "trigger_schedule" ||
              node.kind === "trigger_tool"
            ? "trigger"
            : "attachment";

  return {
    id: node.id,
    type,
    position: { x, y },
    data: { productNode: node },
    draggable: true,
    className: FLOW_NODE_CLASS,
    style: {
      background: "transparent",
      border: "none",
      padding: 0,
      boxShadow: "none",
      zIndex: 2,
    },
    zIndex: 2,
  };
}

/** Minimum canvas height from integration count — used by tests. */
export function estimateCanvasHeight(integrationCount: number): number {
  const columns = integrationCount <= 4 ? 1 : integrationCount <= 8 ? 2 : 3;
  const rows = Math.ceil(Math.max(1, integrationCount) / columns);
  return LAYOUT.agentY + LAYOUT.agentHeight + LAYOUT.outputGap + rows * LAYOUT.rowGap;
}
