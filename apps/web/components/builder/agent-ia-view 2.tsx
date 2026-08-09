"use client";

import { PanelRightClose, PanelRightOpen, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentModuleGraph } from "@/components/builder/agent-module-graph";
import { LiveView } from "@/components/builder/live-view";
import { Button } from "@/components/ui/button";
import { useAgentGraph, useAgentSpec } from "@/hooks/use-agents";
import { useTranslation } from "@/hooks/use-translation";
import { buildAgentModules } from "@/lib/domain/agent-modules";
import { cn } from "@/lib/utils";

const DEFAULT_CHAT_PCT = 45;
const MIN_CHAT_PCT = 28;
const MAX_CHAT_PCT = 72;

/**
 * "Agent IA" workspace: chat with the agent on the left, its module canvas on
 * the right. Replaces the former Live and Structure tabs.
 */
export function AgentIaView({ agentId }: { agentId: string }) {
  const { t } = useTranslation(["structure", "builder"]);
  const { data: graphResponse } = useAgentGraph(agentId);
  const { data: spec } = useAgentSpec(agentId);
  const [panelOpen, setPanelOpen] = useState(true);
  const [chatPct, setChatPct] = useState(DEFAULT_CHAT_PCT);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const modules = useMemo(
    () => buildAgentModules(graphResponse?.graph, spec),
    [graphResponse?.graph, spec],
  );
  const hasModules = modules.chain.length > 0 || modules.attachments.length > 0;

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0) return;
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      setChatPct(Math.min(MAX_CHAT_PCT, Math.max(MIN_CHAT_PCT, next)));
    };

    const onUp = () => setDragging(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  return (
    <div ref={rootRef} className="flex h-full min-h-0">
      <div
        className={cn("min-w-0", panelOpen ? "shrink-0" : "min-w-0 flex-1")}
        style={panelOpen ? { width: `${chatPct}%` } : undefined}
      >
        <LiveView agentId={agentId} />
      </div>

      <aside
        className={cn(
          "relative hidden min-h-0 flex-col border-l border-border lg:flex",
          panelOpen ? "min-w-0 flex-1" : "w-[52px] shrink-0",
        )}
        aria-label={t("structure:modules.title")}
      >
        {panelOpen ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(chatPct)}
            aria-valuemin={MIN_CHAT_PCT}
            aria-valuemax={MAX_CHAT_PCT}
            aria-label={t("structure:modules.resize")}
            tabIndex={0}
            onPointerDown={(event) => {
              event.preventDefault();
              (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
              setDragging(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setChatPct((pct) => Math.max(MIN_CHAT_PCT, pct - 2));
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                setChatPct((pct) => Math.min(MAX_CHAT_PCT, pct + 2));
              } else if (event.key === "Home") {
                event.preventDefault();
                setChatPct(DEFAULT_CHAT_PCT);
              }
            }}
            className="absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize touch-none outline-none focus:outline-none focus-visible:outline-none"
          />
        ) : null}

        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b border-border px-3 py-3",
            panelOpen ? "justify-between" : "justify-center",
          )}
        >
          {panelOpen ? (
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <Workflow className="size-4 text-brand" aria-hidden="true" />
              <span className="truncate">{t("structure:modules.title")}</span>
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setPanelOpen((open) => !open)}
            aria-label={t(
              panelOpen ? "structure:modules.collapse" : "structure:modules.expand",
            )}
          >
            {panelOpen ? (
              <PanelRightClose className="size-4" aria-hidden="true" />
            ) : (
              <PanelRightOpen className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        {panelOpen ? (
          <div className="min-h-0 flex-1">
            {hasModules ? (
              <AgentModuleGraph agentId={agentId} modules={modules} />
            ) : (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                {t("structure:graph.fallback")}
              </p>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
