"use client";

import { useQuery } from "@tanstack/react-query";
import { PanelRightClose, PanelRightOpen, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProductAgentGraph } from "@/components/builder/agent-structure/product-agent-graph";
import { buildProductAgentGraph } from "@/components/builder/agent-structure/graph-adapter";
import { LiveView } from "@/components/builder/live-view";
import { Button } from "@/components/ui/button";
import { useAgentGraph, useAgentSpec } from "@/hooks/use-agents";
import { useLiveExecutionState } from "@/hooks/use-live-execution";
import { useLiveThread } from "@/hooks/use-live";
import { useRunEventStream } from "@/hooks/use-run-sse";
import { useTranslation } from "@/hooks/use-translation";
import { listAgentConnections } from "@/lib/actions/connections";
import { getAgentReadiness } from "@/lib/actions/integrations";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ApprovalMode } from "@/lib/domain/types";
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
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = requireSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
  }, []);

  const { data: liveThread } = useLiveThread(agentId);
  const liveRunId = useMemo(() => {
    const messages = liveThread?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i] as { interruptRunId?: string; runId?: string };
      if (m?.interruptRunId) return m.interruptRunId;
      if (m?.runId) return m.runId;
    }
    return null;
  }, [liveThread?.messages]);

  const connectionsQuery = useQuery({
    queryKey: ["agent-connections", agentId],
    queryFn: () => listAgentConnections(agentId),
    staleTime: 15_000,
  });

  const readinessQuery = useQuery({
    queryKey: ["agent-readiness", agentId],
    queryFn: () => getAgentReadiness(agentId),
    staleTime: 15_000,
  });

  const boundToolIds = useMemo(() => {
    const ids = new Set<string>();
    for (const binding of connectionsQuery.data?.bindings ?? []) {
      if (!binding.enabled) continue;
      for (const toolId of binding.tool_ids) ids.add(toolId);
    }
    return ids;
  }, [connectionsQuery.data?.bindings]);

  const boundProviders = useMemo(() => {
    const providers = new Set<string>();
    for (const connection of connectionsQuery.data?.connections ?? []) {
      const status = (connection.status || "active").toLowerCase();
      if (status === "active" || status === "connected" || status === "ok") {
        providers.add(connection.provider);
      }
    }
    return providers;
  }, [connectionsQuery.data?.connections]);

  const brainCheck = readinessQuery.data?.checks?.find((c) => c.key === "brain");
  const modelStatus =
    brainCheck === undefined
      ? undefined
      : brainCheck.ok
        ? ("ready" as const)
        : ("setup_required" as const);

  const productGraph = useMemo(
    () =>
      buildProductAgentGraph({
        definition: spec,
        graph: graphResponse?.graph,
        boundToolIds,
        boundProviders,
        modelStatus,
      }),
    [spec, graphResponse?.graph, boundToolIds, boundProviders, modelStatus],
  );

  const hasGraph = productGraph.nodes.length > 0;

  const { data: executionVisual } = useLiveExecutionState(
    liveRunId,
    Boolean(liveRunId),
    productGraph,
  );

  useRunEventStream({
    agentId,
    runId: liveRunId,
    enabled: Boolean(liveRunId),
    accessToken,
  });

  const toolApprovals = useMemo(() => {
    const map: Record<string, ApprovalMode | string> = {};
    for (const binding of spec?.toolBindings ?? []) {
      if (binding.approvalMode) map[binding.toolId] = binding.approvalMode;
    }
    return map;
  }, [spec?.toolBindings]);

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
              {readinessQuery.data?.status ? (
                <span
                  className={cn(
                    "truncate rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                    readinessQuery.data.status === "ready" &&
                      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    readinessQuery.data.status === "needs_setup" &&
                      "bg-amber-500/10 text-amber-800 dark:text-amber-300",
                    readinessQuery.data.status === "needs_attention" &&
                      "bg-red-500/10 text-red-700 dark:text-red-400",
                    !["ready", "needs_setup", "needs_attention"].includes(
                      readinessQuery.data.status,
                    ) && "bg-muted text-muted-foreground",
                  )}
                >
                  {t(`structure:modules.readiness.status.${readinessQuery.data.status}`, {
                    defaultValue:
                      readinessQuery.data.status === "ready"
                        ? "Ready"
                        : readinessQuery.data.status === "needs_setup"
                          ? "Setup needed"
                          : readinessQuery.data.status === "needs_attention"
                            ? "Needs attention"
                            : readinessQuery.data.status.replaceAll("_", " "),
                  })}
                </span>
              ) : null}
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
            {hasGraph && spec ? (
              <ProductAgentGraph
                agentId={agentId}
                spec={spec}
                graph={graphResponse?.graph}
                connections={connectionsQuery.data?.connections ?? []}
                bindings={connectionsQuery.data?.bindings ?? []}
                toolApprovals={toolApprovals}
                boundToolIds={boundToolIds}
                boundProviders={boundProviders}
                modelStatus={modelStatus}
                executionVisual={executionVisual}
                onConnectionsChanged={() => void connectionsQuery.refetch()}
                onConfigChanged={() => {
                  void connectionsQuery.refetch();
                  void readinessQuery.refetch();
                }}
              />
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
