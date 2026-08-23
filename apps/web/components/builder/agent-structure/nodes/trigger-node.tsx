"use client";

import { Position, type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";

import {
  HiddenHandle,
  SquareCard,
  displayStatus,
} from "@/components/builder/agent-structure/node-styles";
import type { ProductNodeData } from "@/components/builder/agent-structure/nodes/agent-node";
import {
  STRUCTURE_COLORS,
  StructureKindIcon,
  statusShowsCheck,
  statusShowsError,
  statusShowsPause,
  statusShowsSpinner,
  statusToTone,
} from "@/components/builder/agent-structure/structure-icon";
import { getCachedIntegrationIcon } from "@/lib/integrations/icon-resolver";
import { Check, Loader2, Pause, X } from "lucide-react";

import { useTranslation } from "@/hooks/use-translation";

function CompactStatusBadge({ status }: { status: string }) {
  if (statusShowsPause(status)) {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm">
        <Pause className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
      </span>
    );
  }
  if (statusShowsSpinner(status)) {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-white shadow-sm">
        <Loader2 className="size-3.5 animate-spin text-[#fa8908]" aria-hidden />
      </span>
    );
  }
  if (statusShowsCheck(status)) {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-[#50d835] text-white shadow-sm">
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (statusShowsError(status)) {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-[#e53935] text-white shadow-sm">
        <X className="size-3" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  return null;
}

function ToolTriggerIcon({
  appKey,
  status,
  imgSrc,
}: {
  appKey: string;
  status: string;
  imgSrc?: string | null;
}) {
  const tone = statusToTone(status);
  const [failed, setFailed] = useState(false);
  const logoSrc = failed ? null : (imgSrc ?? getCachedIntegrationIcon(appKey) ?? null);

  useEffect(() => {
    setFailed(false);
  }, [appKey, imgSrc]);

  return (
    <span className="relative inline-flex size-14 shrink-0 items-center justify-center">
      <img
        src={`/structure-icons/rings/${tone}.png`}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 size-full object-contain"
      />
      {logoSrc ? (
        // Pipedream logos are off-origin.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt=""
          draggable={false}
          className="relative z-[1] size-[38%] bg-transparent object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="relative z-[1] text-[10px] font-bold uppercase tracking-wide"
          style={{ color: STRUCTURE_COLORS[tone].icon }}
        >
          {appKey.replaceAll("_", "").slice(0, 2)}
        </span>
      )}
      <CompactStatusBadge status={status} />
    </span>
  );
}

export function TriggerNode({ data }: NodeProps<Node<ProductNodeData>>) {
  const { t } = useTranslation("structure");
  const node = data.productNode;
  const status = String(displayStatus(node, data.executionStatus as never));
  const isTool = node.kind === "trigger_tool";
  const appKey = node.integration?.appKey;

  return (
    <div className="relative h-[118px] w-[118px]">
      <HiddenHandle
        type="source"
        position={Position.Bottom}
        id="out"
        style={{ left: "50%", bottom: 0, top: "auto", transform: "translate(-50%, 50%)" }}
      />
      <SquareCard selected={data.selected} status={status} className="h-full w-full">
        {isTool && appKey ? (
          <ToolTriggerIcon
            appKey={appKey}
            status={status}
            imgSrc={typeof data.imgSrc === "string" ? data.imgSrc : null}
          />
        ) : (
          <StructureKindIcon kind={node.kind} status={status} className="size-14" />
        )}
        <p className="max-w-full truncate text-center text-sm font-medium leading-tight">
          {/* The module says what it is, not which event it listens to. The
              event name lives in the drawer, where it can be read in full and
              changed; on a 118px tile "New Message (Instant)" only truncates. */}
          {isTool ? t("nodes.toolTrigger") : node.label}
        </p>
      </SquareCard>
    </div>
  );
}
