"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelRightClose, PanelRightOpen, RefreshCw, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { ProductAgentGraph } from "@/components/builder/agent-structure/product-agent-graph";
import { buildProductAgentGraph } from "@/components/builder/agent-structure/graph-adapter";
import { LiveView } from "@/components/builder/live-view";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAgentGraph, useAgentSpec } from "@/hooks/use-agents";
import { useLiveExecutionState } from "@/hooks/use-live-execution";
import { useLiveThread } from "@/hooks/use-live";
import { useRunEventStream } from "@/hooks/use-run-sse";
import { useTranslation } from "@/hooks/use-translation";
import { cancelLiveRun } from "@/lib/actions/live";
import { listAgentConnections } from "@/lib/actions/connections";
import { getAgentReadiness } from "@/lib/actions/integrations";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ApprovalMode } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const DEFAULT_CHAT_PCT = 45;
const MIN_CHAT_PCT = 28;
const MAX_CHAT_PCT = 72;
const LG_MEDIA = "(min-width: 1024px)";

function useIsLgViewport(): boolean {
  const [isLg, setIsLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(LG_MEDIA);
    const onChange = () => setIsLg(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isLg;
}

/**
 * "Agent IA" workspace: chat with the agent on the left, its module canvas on
 * the right. Replaces the former Live and Structure tabs.
 */
export function AgentIaView({
  agentId,
  mode = "owner",
}: {
  agentId: string;
  mode?: "owner" | "consumer";
}) {
  const { t } = useTranslation(["structure", "builder"]);
  const queryClient = useQueryClient();
  const { data: graphResponse } = useAgentGraph(agentId);
  const { data: spec } = useAgentSpec(agentId);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileModulesOpen, setMobileModulesOpen] = useState(false);
  const [chatPct, setChatPct] = useState(DEFAULT_CHAT_PCT);
  const [dragging, setDragging] = useState(false);
  const isLg = useIsLgViewport();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [setupOpen, setSetupOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const readOnly = mode === "consumer";

  useEffect(() => {
    const supabase = requireSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
  }, []);

  const { data: liveThread } = useLiveThread(agentId);
  const messageRunId = useMemo(() => {
    const messages = liveThread?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.pending && m.runId) return m.runId;
    }
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.runId) return m.runId;
    }
    return null;
  }, [liveThread?.messages]);

  const activeRunQuery = useQuery({
    queryKey: ["active-live-run", agentId],
    enabled: Boolean(agentId),
    staleTime: 4000,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    notifyOnChangeProps: ["data", "error"],
    refetchInterval: (q) => {
      const row = q.state.data as { id?: string; status?: string } | null | undefined;
      if (row?.status === "queued" || row?.status === "running") return 2200;
      const msgs = liveThread?.messages ?? [];
      const last = msgs[msgs.length - 1];
      if (last?.role === "user" || last?.pending) return 2200;
      return false;
    },
    queryFn: async () => {
      const supabase = requireSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("runs")
        .select("id,status,created_at")
        .eq("agent_id", agentId)
        .eq("run_type", "live")
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const liveRunId = messageRunId || activeRunQuery.data?.id || null;

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

  const boundAppIds = useMemo(() => {
    const apps = new Set<string>();
    for (const connection of connectionsQuery.data?.connections ?? []) {
      const status = (connection.status || "active").toLowerCase();
      if (!(status === "active" || status === "connected" || status === "ok")) continue;
      if (connection.provider === "google") {
        // Suite-level Google OAuth must not mark Calendar/Gmail ready —
        // each product app needs its own Pipedream (or scoped) connection.
        apps.add("google");
        continue;
      }
      const appId =
        connection.app_id ||
        (typeof connection.provider_metadata?.app_id === "string"
          ? connection.provider_metadata.app_id
          : null);
      if (appId) apps.add(String(appId).toLowerCase());
    }
    return apps;
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
        boundAppIds,
        modelStatus,
      }),
    [spec, graphResponse?.graph, boundToolIds, boundProviders, boundAppIds, modelStatus],
  );

  // #region agent log
  useEffect(() => {
    const integrations = productGraph.nodes.filter((n) => n.kind === "integration").map((n) => n.label);
    fetch("http://127.0.0.1:7857/ingest/1ac9df66-3a30-4b3a-a8c1-bbbdaf39db81", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "faa28e" },
      body: JSON.stringify({
        sessionId: "faa28e",
        runId: "post-fix",
        hypothesisId: "G",
        location: "agent-ia-view.tsx:productGraph",
        message: "structure graph nodes",
        data: {
          agentId,
          specToolCount: spec?.tools?.length ?? 0,
          specToolIds: (spec?.tools ?? []).slice(0, 12).map((t) => t.tool),
          integrationLabels: integrations,
          nodeKinds: productGraph.nodes.map((n) => n.kind),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [agentId, productGraph, spec]);
  // #endregion

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

  const setupMissing = useMemo(() => {
    const items: string[] = [];
    for (const c of readinessQuery.data?.checks ?? []) {
      if (!c.ok && c.message) items.push(c.message);
    }
    for (const m of readinessQuery.data?.missingConnections ?? []) {
      const provider = typeof m.provider === "string" ? m.provider : "app";
      const appId = typeof m.app_id === "string" ? m.app_id : provider;
      items.push(`Connect ${appId}`);
    }
    for (const m of readinessQuery.data?.missingConfig ?? []) {
      if (typeof m.message === "string" && m.message) items.push(m.message);
      else if (typeof m.tool_id === "string") {
        const fields = Array.isArray(m.fields) ? m.fields.join(", ") : "";
        items.push(
          fields
            ? `Configure ${m.tool_id}: ${fields}`
            : `Configure ${m.tool_id}`,
        );
      }
    }
    // Graph nodes still needing setup (UI source of truth for Structure badge)
    for (const n of productGraph.nodes) {
      if (n.configurationStatus === "setup_required") {
        items.push(`${n.label} needs setup`);
      }
    }
    return [...new Set(items)];
  }, [
    readinessQuery.data?.checks,
    readinessQuery.data?.missingConnections,
    readinessQuery.data?.missingConfig,
    productGraph.nodes,
  ]);

  const showSetupBadge =
    readinessQuery.data?.status === "needs_setup" ||
    readinessQuery.data?.status === "needs_attention" ||
    productGraph.nodes.some((n) => n.configurationStatus === "setup_required");

  const resetStructureExecution = () => {
    startRefresh(async () => {
      try {
        await cancelLiveRun({ agentId, runId: liveRunId, silent: true });
      } catch {
        // Best-effort stop.
      }
      void queryClient.removeQueries({ queryKey: ["live-execution"] });
      void queryClient.removeQueries({ queryKey: ["active-live-run", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["live", agentId] });
    });
  };

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

  const modulesGraph = hasGraph && spec ? (
    <ProductAgentGraph
      agentId={agentId}
      spec={spec}
      graph={graphResponse?.graph}
      connections={connectionsQuery.data?.connections ?? []}
      bindings={connectionsQuery.data?.bindings ?? []}
      toolApprovals={toolApprovals}
      boundToolIds={boundToolIds}
      boundProviders={boundProviders}
      boundAppIds={boundAppIds}
      modelStatus={modelStatus}
      executionVisual={executionVisual}
      readOnly={readOnly}
      onConnectionsChanged={
        readOnly
          ? undefined
          : () => {
              void connectionsQuery.refetch();
              void readinessQuery.refetch();
            }
      }
      onConfigChanged={
        readOnly
          ? undefined
          : () => {
              void connectionsQuery.refetch();
              void readinessQuery.refetch();
            }
      }
    />
  ) : (
    <p className="px-6 py-10 text-center text-sm text-muted-foreground">
      {t("structure:graph.fallback")}
    </p>
  );

  return (
    <div ref={rootRef} className="flex h-full min-h-0">
      <div
        className={cn("min-w-0 flex-1", panelOpen && isLg && "shrink-0")}
        style={panelOpen && isLg ? { width: `${chatPct}%` } : undefined}
      >
        <LiveView
          agentId={agentId}
          activeRunId={liveRunId}
          headerActions={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="shrink-0 lg:hidden"
              onClick={() => setMobileModulesOpen(true)}
              aria-label={t("structure:modules.title")}
              title={t("structure:modules.title")}
            >
              <Workflow className="size-4" aria-hidden="true" />
            </Button>
          }
        />
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
            <span className="relative flex min-w-0 items-center gap-2 text-sm font-medium">
              <Workflow className="size-4 text-brand" aria-hidden="true" />
              <span className="truncate">{t("structure:modules.title")}</span>
              {showSetupBadge || readinessQuery.data?.status === "ready" ? (
                <button
                  type="button"
                  onClick={() => setSetupOpen((o) => !o)}
                  className={cn(
                    "truncate rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                    (readinessQuery.data?.status === "ready" && !showSetupBadge) &&
                      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    (showSetupBadge && readinessQuery.data?.status !== "needs_attention") &&
                      "bg-amber-500/10 text-amber-800 dark:text-amber-300",
                    readinessQuery.data?.status === "needs_attention" &&
                      "bg-red-500/10 text-red-700 dark:text-red-400",
                  )}
                  title={
                    setupMissing.length > 0
                      ? setupMissing.join(" · ")
                      : t("structure:modules.setupBanner.body")
                  }
                  aria-expanded={setupOpen}
                >
                  {showSetupBadge
                    ? t("structure:modules.readiness.status.needs_setup", {
                        defaultValue: "Setup needed",
                      })
                    : t("structure:modules.readiness.status.ready", {
                        defaultValue: "Ready",
                      })}
                </button>
              ) : null}
              {setupOpen ? (
                <div className="absolute left-0 top-full z-30 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-3 shadow-xl">
                  <p className="text-xs font-semibold text-foreground">
                    {showSetupBadge
                      ? t("structure:modules.setupBanner.title")
                      : t("structure:modules.readiness.status.ready", {
                          defaultValue: "Ready",
                        })}
                  </p>
                  {setupMissing.length > 0 ? (
                    <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs text-muted-foreground">
                      {setupMissing.map((item) => (
                        <li key={item} className="leading-snug">
                          · {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("structure:modules.readiness.connected", {
                        defaultValue: "Accounts look connected.",
                      })}
                    </p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2 h-7 w-full text-xs"
                    onClick={() => setSetupOpen(false)}
                  >
                    {t("common:actions.close", { defaultValue: "Close" })}
                  </Button>
                </div>
              ) : null}
            </span>
          ) : null}
          <div className="flex shrink-0 items-center gap-1">
            {panelOpen && !readOnly ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={resetStructureExecution}
                disabled={refreshing}
                aria-label={t("structure:modules.refresh", {
                  defaultValue: "Reset execution",
                })}
                title={t("structure:modules.refreshHint", {
                  defaultValue: "Stop the agent and reset structure colors",
                })}
              >
                <RefreshCw
                  className={cn("size-4", refreshing && "animate-spin")}
                  aria-hidden="true"
                />
              </Button>
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
        </div>

        {panelOpen ? (
          <div className="min-h-0 flex-1">{modulesGraph}</div>
        ) : null}
      </aside>

      <Sheet open={mobileModulesOpen} onOpenChange={setMobileModulesOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Workflow className="size-4 text-brand" aria-hidden="true" />
              {t("structure:modules.title")}
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden">{modulesGraph}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
