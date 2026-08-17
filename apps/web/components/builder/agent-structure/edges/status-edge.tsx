"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

import type { ModuleExecState } from "@/hooks/use-live-execution";

export interface StatusEdgeData extends Record<string, unknown> {
  style?: "solid" | "dashed";
  executionStatus?: ModuleExecState;
}

function strokeForStatus(status?: ModuleExecState): {
  stroke: string;
  width: number;
  animated: boolean;
} {
  switch (status) {
    case "running":
    case "queued":
      return { stroke: "#fa8908", width: 2.4, animated: true };
    case "success":
      return { stroke: "#50d835", width: 2.2, animated: false };
    case "error":
      return { stroke: "#e53935", width: 2.2, animated: false };
    case "waiting_for_connection":
    case "waiting_for_approval":
      return { stroke: "#ffc701", width: 2, animated: false };
    default:
      return { stroke: "var(--structure-edge)", width: 1.85, animated: false };
  }
}

export function StatusEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as StatusEdgeData;
  const dashed = edgeData.style === "dashed";
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: dashed ? 0.4 : 0.12,
  });
  const { stroke, width, animated } = strokeForStatus(edgeData.executionStatus);

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke,
        strokeWidth: width,
        strokeDasharray: dashed ? "8 6" : undefined,
        strokeLinecap: "round",
      }}
      className={animated ? "animate-[dash_1s_linear_infinite]" : undefined}
    />
  );
}
