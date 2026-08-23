import { describe, expect, it } from "vitest";

import {
  LAYOUT,
  estimateCanvasHeight,
  integrationColumns,
  layoutProductGraph,
} from "@/components/builder/agent-structure/product-graph-layout";
import type { ProductAgentGraph, ProductNode } from "@/lib/domain/product-agent-graph";

/**
 * An agent with five or six integrations was drawn as a ragged block: the last
 * row kept the grid's left edge, so a lone tool sat under the first column with
 * an empty gap beside it. Rows are centred on the block now — and nothing may
 * ever be drawn on top of anything else.
 */
function graphWith(integrationCount: number): ProductAgentGraph {
  const nodes: ProductNode[] = [
    { id: "trigger:chat", kind: "trigger_chat", label: "Chat", configurationStatus: "ready" },
    { id: "agent", kind: "agent", label: "Agent", configurationStatus: "ready" },
    { id: "output", kind: "output", label: "Sortie", configurationStatus: "ready" },
    { id: "model", kind: "model", label: "Model", configurationStatus: "ready" },
    { id: "memory", kind: "memory", label: "Memory", configurationStatus: "ready" },
  ];
  for (let i = 0; i < integrationCount; i += 1) {
    nodes.push({
      id: `integration:${i}`,
      kind: "integration",
      label: `App ${i}`,
      configurationStatus: "ready",
    });
  }
  return { nodes, edges: [] } as ProductAgentGraph;
}

function overlaps(a: { x: number; y: number }, b: { x: number; y: number }) {
  const w = LAYOUT.nodeWidth.agent;
  return Math.abs(a.x - b.x) < 90 && Math.abs(a.y - b.y) < 90 && w > 0;
}

describe("product graph layout", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 12])("never stacks nodes for %i integrations", (count) => {
    const { nodes } = layoutProductGraph(graphWith(count));
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        expect(
          overlaps(nodes[i].position, nodes[j].position),
          `${nodes[i].id} overlaps ${nodes[j].id}`,
        ).toBe(false);
      }
    }
  });

  it("centres a short last row instead of leaving it ragged", () => {
    const { nodes } = layoutProductGraph(graphWith(5));
    const xs = nodes.filter((n) => n.id.startsWith("integration:")).map((n) => n.position.x);
    const firstRow = [xs[0], xs[1]];
    const lastRow = [xs[4]];
    const centre = (row: number[]) => row.reduce((a, b) => a + b, 0) / row.length;
    expect(centre(lastRow)).toBeCloseTo(centre(firstRow), 0);
  });

  it("keeps every integration in the same rows it was given", () => {
    const { nodes } = layoutProductGraph(graphWith(6));
    const integrations = nodes.filter((n) => n.id.startsWith("integration:"));
    expect(integrations).toHaveLength(6);
    expect(new Set(integrations.map((n) => n.position.y)).size).toBe(3);
  });

  it("caps the block at three columns", () => {
    expect(integrationColumns(4)).toBe(1);
    expect(integrationColumns(8)).toBe(2);
    expect(integrationColumns(30)).toBe(3);
  });

  it("gives the canvas room for every row", () => {
    // Height follows rows, not tools: nine tools sit on three columns and take
    // the same three rows as three tools on one.
    expect(estimateCanvasHeight(9)).toBe(estimateCanvasHeight(3));
    expect(estimateCanvasHeight(12)).toBeGreaterThan(estimateCanvasHeight(2));
  });
});
