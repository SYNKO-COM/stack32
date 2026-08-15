"use client";

import { Handle, Position } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";

import type { ModuleExecState } from "@/hooks/use-live-execution";
import type { ConfigurationStatus, ProductNode } from "@/lib/domain/product-agent-graph";
import {
  statusShowsWarning,
  statusToTone,
  toneBorderColor,
} from "@/components/builder/agent-structure/structure-icon";
import { cn } from "@/lib/utils";

export function displayStatus(
  node: ProductNode,
  executionStatus?: ModuleExecState,
): ModuleExecState | ConfigurationStatus {
  if (
    executionStatus &&
    executionStatus !== "idle" &&
    (executionStatus === "running" ||
      executionStatus === "queued" ||
      executionStatus === "success" ||
      executionStatus === "error" ||
      executionStatus === "waiting_for_approval" ||
      executionStatus === "waiting_for_connection")
  ) {
    return executionStatus;
  }
  return node.configurationStatus;
}

export const HIDDEN_HANDLE =
  "!h-2.5 !w-2.5 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0";

export function HiddenHandle({
  type,
  position,
  id,
  style,
}: {
  type: "source" | "target";
  position: Position;
  id: string;
  style?: CSSProperties;
}) {
  return (
    <Handle type={type} position={position} id={id} className={HIDDEN_HANDLE} style={style} />
  );
}

export function NodeFrame({
  selected,
  className,
  children,
}: {
  selected?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        selected && "[&_.structure-shape]:ring-2 [&_.structure-shape]:ring-brand/45",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SquareCard({
  selected,
  status,
  className,
  children,
}: {
  selected?: boolean;
  status: string;
  className?: string;
  children: ReactNode;
}) {
  const tone = statusToTone(status);
  const border = toneBorderColor(tone, status);
  return (
    <div className="relative">
      {statusShowsWarning(status) ? (
        <span
          className="absolute -top-6 left-1/2 z-10 -translate-x-1/2 text-[16px] leading-none"
          aria-hidden
        >
          ⚠️
        </span>
      ) : null}
      <div
        className={cn(
          "structure-shape flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-3 shadow-sm dark:bg-background",
          selected && "ring-2 ring-brand/45",
          className,
        )}
        style={{ border: `2px solid ${border}` }}
      >
        {children}
      </div>
    </div>
  );
}

export function flowNodeClassName(extra?: string): string {
  return cn(
    "!bg-transparent !border-0 !p-0 !shadow-none !outline-none",
    extra,
  );
}