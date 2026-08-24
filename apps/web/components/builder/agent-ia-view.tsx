"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PanelRightClose, PanelRightOpen, Play, RefreshCw, Square, Workflow } from "lucide-react";
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
import { useAgent, useAgentGraph, useAgentSpec } from "@/hooks/use-agents";
import { useLiveExecutionState } from "@/hooks/use-live-execution";
import { useLiveThread } from "@/hooks/use-live";
import { useRunEventStream } from "@/hooks/use-run-sse";
import { useTranslation } from "@/hooks/use-translation";
import { cancelLiveRun } from "@/lib/actions/live";
import { isStaleInflightMessage } from "@/lib/chat/backend-failure";
import {
  getAgentTriggerRuntime,
  startAgentTriggerListen,
  stopAgentTriggerListen,
} from "@/lib/actions/builder";
import { listAgentConnections } from "@/lib/actions/connections";
import { getAgentReadiness } from "@/lib/actions/integrations";
import type { ExecutionVisualState } from "@/lib/domain/execution-state";
import { mergeOptimisticLiveChatTurn } from "@/lib/domain/execution-state";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ApprovalMode } from "@/lib/domain/types";
import { appsEquivalent } from "@/lib/integrations/app-grouping";
import { cn } from "@/lib/utils";
import { appDisplayName } from "@/lib/integrations/app-name";
import { appKeyFromToolId, formatList } from "@/lib/integrations/app-name";
import { resolvePropCopy } from "@/lib/integrations/prop-labels";

const DRAFT_WAKE_MS = 10 * 60 * 1000;

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
  installationId = null,
}: {
  agentId: string;
  mode?: "owner" | "consumer";
  /** Subscriber installation — scopes readiness/connections for public use. */
  installationId?: string | null;
}) {
  const { t, i18n } = useTranslation(["structure", "builder"]);
  const queryClient = useQueryClient();
  const { data: agent } = useAgent(agentId);
  const { data: graphResponse } = useAgentGraph(agentId);
  const { data: spec } = useAgentSpec(agentId);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileModulesOpen, setMobileModulesOpen] = useState(false);
  const [chatPct, setChatPct] = useState(DEFAULT_CHAT_PCT);
  const [dragging, setDragging] = useState(false);
  const isLg = useIsLgViewport();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [waking, startWake] = useTransition();
  const [setupOpen, setSetupOpen] = useState(false);
  const [ignoredRunIds, setIgnoredRunIds] = useState<string[]>([]);
  const [wakeUntilMs, setWakeUntilMs] = useState<number | null>(null);
  const [wakeError, setWakeError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const consumer = mode === "consumer";
  const structureLocked = consumer;
  const allowInstallationConfig = consumer;
  const agentPublished = agent?.status === "published";

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
      if (
        row?.status === "queued" ||
        row?.status === "running" ||
        row?.status === "waiting_for_input"
      ) {
        return 2200;
      }
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
        .in("status", ["queued", "running", "waiting_for_input"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const liveRunId = messageRunId || activeRunQuery.data?.id || null;
  const visualRunId =
    liveRunId && !ignoredRunIds.includes(liveRunId) ? liveRunId : null;

  /** True from optimistic send until the assistant reply lands (or turn goes stale). */
  const liveTurnInFlight = useMemo(() => {
    const messages = liveThread?.messages ?? [];
    if (messages.some((m) => m.pending)) return true;
    const last = messages.at(-1);
    return Boolean(
      last?.role === "user" &&
        last.createdAt &&
        !isStaleInflightMessage(last.createdAt),
    );
  }, [liveThread?.messages]);

  const connectionsQuery = useQuery({
    queryKey: ["agent-connections", agentId, installationId ?? "default"],
    queryFn: () => listAgentConnections(agentId),
    staleTime: 15_000,
  });

  const readinessQuery = useQuery({
    queryKey: ["agent-readiness", agentId, installationId ?? "default"],
    queryFn: () => getAgentReadiness(agentId),
    staleTime: 15_000,
  });

  const boundToolIds = useMemo(() => {
    const ids = new Set<string>();
    for (const binding of connectionsQuery.data?.bindings ?? []) {
      if (!binding.enabled) continue;
      for (const toolId of binding.tool_ids ?? []) ids.add(toolId);
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
    // An account this agent is actually bound to — not merely one the owner
    // has connected somewhere. The endpoint returns both, and reading the
    // account-wide list made every app look connected on an agent with no
    // bindings at all: the drawer said "Connecté", the pickers came back empty
    // because the service refuses an unbound account, and listening failed with
    // "check the connection and the event" on a screen showing a green badge.
    const boundConnectionIds = new Set(
      (connectionsQuery.data?.bindings ?? [])
        .filter((b) => b.enabled)
        .map((b) => String(b.connection_id)),
    );
    const apps = new Set<string>();
    for (const connection of connectionsQuery.data?.connections ?? []) {
      const status = (connection.status || "active").toLowerCase();
      if (!(status === "active" || status === "connected" || status === "ok")) continue;
      if (!boundConnectionIds.has(String(connection.id))) continue;
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
  }, [connectionsQuery.data?.connections, connectionsQuery.data?.bindings]);

  const brainCheck = readinessQuery.data?.checks?.find((c) => c.key === "brain");
  const modelStatus =
    brainCheck === undefined
      ? undefined
      : brainCheck.ok
        ? ("ready" as const)
        : ("setup_required" as const);

  const memoryCheck = readinessQuery.data?.checks?.find((c) => c.key === "memory");
  const memoryStatus = useMemo(() => {
    if (spec?.memory?.provider === "external_postgres") {
      const appId = (spec.memory.externalAppId || "").toLowerCase();
      if (!appId) return "setup_required" as const;
      const connected = [...boundAppIds].some((id) => appsEquivalent(id, appId));
      if (connected) return "ready" as const;
      if (memoryCheck !== undefined) {
        return memoryCheck.ok ? ("ready" as const) : ("setup_required" as const);
      }
      return "setup_required" as const;
    }
    if (memoryCheck === undefined) return undefined;
    return memoryCheck.ok ? ("ready" as const) : ("setup_required" as const);
  }, [spec?.memory?.provider, spec?.memory?.externalAppId, boundAppIds, memoryCheck]);

  const productGraph = useMemo(() => {
    try {
      const toolStatuses: Record<string, string> = {};
      for (const m of readinessQuery.data?.missingConfig ?? []) {
        const tid = typeof m.tool_id === "string" ? m.tool_id : null;
        if (tid) toolStatuses[tid] = "setup_required";
      }
      return buildProductAgentGraph({
        definition: spec,
        graph: graphResponse?.graph,
        boundToolIds,
        boundProviders,
        boundAppIds,
        modelStatus,
        memoryStatus,
        toolStatuses,
      });
    } catch {
      return { nodes: [], edges: [] };
    }
  }, [
    spec,
    graphResponse?.graph,
    boundToolIds,
    boundProviders,
    boundAppIds,
    modelStatus,
    memoryStatus,
    readinessQuery.data?.missingConfig,
  ]);

  const hasGraph = productGraph.nodes.length > 0;

  const { data: executionVisual } = useLiveExecutionState(
    visualRunId,
    Boolean(visualRunId),
    productGraph,
  );

  const toolTriggerConfigured = Boolean(
    (spec?.triggers ?? []).find((row) => row.kind === "tool" && row.enabled && row.componentId),
  );

  const triggerRuntime = useQuery({
    queryKey: ["agent-trigger-runtime", agentId],
    queryFn: () => getAgentTriggerRuntime(agentId),
    enabled: Boolean(agentId) && !consumer && toolTriggerConfigured,
    refetchInterval: (query) =>
      query.state.data?.status === "listening" ? 2500 : false,
  });

  useEffect(() => {
    if (!wakeUntilMs) return;
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [wakeUntilMs]);

  useEffect(() => {
    if (!wakeUntilMs) return;
    if (nowMs < wakeUntilMs) return;
    setWakeUntilMs(null);
  }, [nowMs, wakeUntilMs]);

  useEffect(() => {
    const until = triggerRuntime.data?.listeningUntil;
    if (triggerRuntime.data?.status !== "listening" || !until) return;
    const ms = new Date(until).getTime();
    if (!Number.isFinite(ms)) return;
    setWakeUntilMs((prev) => (prev && prev > ms ? prev : ms));
  }, [triggerRuntime.data?.status, triggerRuntime.data?.listeningUntil]);

  const draftAwake =
    !agentPublished &&
    !consumer &&
    ((wakeUntilMs != null && nowMs < wakeUntilMs) ||
      triggerRuntime.data?.status === "listening");

  const wakeExecutionVisual = useMemo((): ExecutionVisualState | undefined => {
    if (visualRunId || !draftAwake) return executionVisual;
    const nodes: ExecutionVisualState["nodes"] = {};
    const edges: ExecutionVisualState["edges"] = {};
    const legacy: ExecutionVisualState["legacy"] = {};
    for (const node of productGraph.nodes) {
      if (
        node.kind !== "trigger_chat" &&
        node.kind !== "trigger_schedule" &&
        node.kind !== "trigger_tool"
      ) {
        continue;
      }
      nodes[node.id] = { executionStatus: "running" };
      legacy[node.id] = "running";
      const edge = productGraph.edges.find(
        (row) => row.source === node.id && row.target === "agent",
      );
      if (edge) {
        edges[edge.id] = { executionStatus: "running" };
      }
    }
    return {
      runStatus: "running",
      nodes,
      edges,
      legacy,
      error: null,
    };
  }, [draftAwake, executionVisual, productGraph.edges, productGraph.nodes, visualRunId]);

  const structureExecutionVisual = useMemo(() => {
    const base = wakeExecutionVisual ?? executionVisual;
    if (!liveTurnInFlight) return base;
    return mergeOptimisticLiveChatTurn(base, productGraph);
  }, [wakeExecutionVisual, executionVisual, liveTurnInFlight, productGraph]);

  const startDraftWake = () => {
    if (consumer || agentPublished || structureLocked) return;
    setWakeError(null);
    startWake(async () => {
      const until = Date.now() + DRAFT_WAKE_MS;
      setWakeUntilMs(until);
      setNowMs(Date.now());
      if (!toolTriggerConfigured) return;
      const result = await startAgentTriggerListen(agentId);
      if (!result.ok) {
        setWakeUntilMs(null);
        // Name what is actually missing. The per-code sentences used to be
        // written for Google Sheets ("Connectez Google Sheets", "fichier,
        // feuille…"), so a Trello trigger missing its board was told to check
        // a spreadsheet it does not have.
        const named = (result.fields ?? []).filter(Boolean);
        if (result.code === "CONFIG_REQUIRED" && named.length) {
          setWakeError(
            t("structure:panel.toolTriggerListenMissing", {
              fields: formatList(
                named.map((f) => resolvePropCopy(f).label.toLowerCase()),
                i18n.language,
              ),
            }),
          );
          return;
        }
        if (result.code === "CONNECTION_REQUIRED") {
          setWakeError(
            t("structure:panel.toolTriggerListenConnect", {
              app: appDisplayName(named[0] ?? "") || t("structure:panel.toolTriggerListenThisApp"),
            }),
          );
          return;
        }
        const key = `structure:panel.toolTriggerListenError_${result.code}`;
        setWakeError(
          t(key, {
            defaultValue: t("structure:panel.toolTriggerListenError"),
            message: result.message,
          }),
        );
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["agent-trigger-runtime", agentId] });
    });
  };

  const stopDraftWake = () => {
    if (consumer || agentPublished || structureLocked) return;
    startWake(async () => {
      setWakeError(null);
      setWakeUntilMs(null);
      try {
        await stopAgentTriggerListen(agentId);
      } catch {
        // Best-effort stop.
      }
      await queryClient.invalidateQueries({ queryKey: ["agent-trigger-runtime", agentId] });
    });
  };

  useRunEventStream({
    agentId,
    runId: visualRunId,
    enabled: Boolean(visualRunId),
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
    // One line per app, in the reader's language. This used to print the
    // readiness check messages verbatim in English and then one line per bound
    // action — "Configure pd:airtable_oauth-update-record: baseId, tableId,
    // recordId" — which named our plumbing, repeated the same app eight times,
    // and told nobody what to actually do.
    const items: string[] = [];

    /** Settings still missing, gathered per app rather than per action. */
    const byApp = new Map<string, Set<string>>();
    for (const m of readinessQuery.data?.missingConfig ?? []) {
      if (typeof m.tool_id !== "string") continue;
      const app = appDisplayName(appKeyFromToolId(m.tool_id)) || m.tool_id;
      const fields = Array.isArray(m.fields) ? m.fields : [];
      const bucket = byApp.get(app) ?? new Set<string>();
      for (const f of fields) {
        if (typeof f === "string" && f.trim()) bucket.add(f.trim());
      }
      byApp.set(app, bucket);
    }

    // Accounts come first: nothing else can be filled until they are linked.
    for (const m of readinessQuery.data?.missingConnections ?? []) {
      const provider = typeof m.provider === "string" ? m.provider : "";
      const appId = typeof m.app_id === "string" ? m.app_id : provider;
      items.push(t("structure:modules.setup.connect", { app: appDisplayName(appId) }));
    }

    for (const [app, fields] of byApp) {
      const labels = [...fields].map((f) => resolvePropCopy(f).label.toLowerCase());
      items.push(
        labels.length
          ? t("structure:modules.setup.chooseFor", {
              app,
              fields: formatList(labels, i18n.language),
            })
          : t("structure:modules.setup.finishFor", { app }),
      );
    }

    return [...new Set(items)];
  }, [
    readinessQuery.data?.missingConnections,
    readinessQuery.data?.missingConfig,
    i18n.language,
    t,
  ]);

  // Readiness lands a beat after the graph does. Judging on the graph alone in
  // the meantime flashed "À configurer" on a fully configured agent every time
  // the page loaded, then corrected itself — so say nothing until it is known.
  const readinessSettled = readinessQuery.isFetched && !readinessQuery.isLoading;
  const showSetupBadge =
    readinessSettled &&
    (readinessQuery.data?.status === "needs_setup" ||
      readinessQuery.data?.status === "needs_attention" ||
      productGraph.nodes.some((n) => n.configurationStatus === "setup_required"));

  const resetStructureExecution = () => {
    startRefresh(async () => {
      setWakeUntilMs(null);
      setWakeError(null);
      if (liveRunId) {
        setIgnoredRunIds((prev) =>
          prev.includes(liveRunId) ? prev : [...prev, liveRunId],
        );
      }
      try {
        await cancelLiveRun({ agentId, runId: liveRunId, silent: true });
      } catch {
        // Best-effort stop.
      }
      queryClient.setQueryData(["live-execution", liveRunId], {
        runStatus: "idle",
        nodes: {},
        edges: {},
        legacy: {},
        error: null,
      });
      void queryClient.removeQueries({ queryKey: ["live-execution"] });
      void queryClient.removeQueries({ queryKey: ["active-live-run", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["live", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "spec"] });
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "graph"] });
      void queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["agent-trigger-runtime", agentId] });
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
      memoryStatus={memoryStatus}
      executionVisual={structureExecutionVisual}
      readOnly={structureLocked}
      allowInstallationConfig={allowInstallationConfig}
      onConnectionsChanged={
        allowInstallationConfig || !structureLocked
          ? () => {
              void connectionsQuery.refetch();
              void readinessQuery.refetch();
            }
          : undefined
      }
      onConfigChanged={
        allowInstallationConfig || !structureLocked
          ? () => {
              void connectionsQuery.refetch();
              void readinessQuery.refetch();
              void queryClient.invalidateQueries({ queryKey: ["agents", agentId] });
            }
          : undefined
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
          activeRunId={visualRunId}
          hideStatusBadge={consumer}
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
            {panelOpen && !structureLocked && !agentPublished ? (
              <Button
                type="button"
                size="icon-sm"
                onClick={draftAwake ? stopDraftWake : startDraftWake}
                disabled={waking}
                aria-label={
                  draftAwake
                    ? t("structure:panel.toolTriggerStop", {
                        defaultValue: "Arrêter l’écoute",
                      })
                    : t("structure:panel.toolTriggerPlay")
                }
                title={
                  draftAwake && wakeUntilMs
                    ? t("structure:panel.toolTriggerPlaying", {
                        until: new Date(wakeUntilMs).toLocaleTimeString(),
                      })
                    : t("structure:panel.toolTriggerPlayHint")
                }
                className={cn(
                  "size-8 shrink-0 text-white hover:text-white",
                  draftAwake
                    ? "rounded-md bg-brand hover:bg-brand/90"
                    : "rounded-md bg-brand hover:bg-brand/90",
                )}
              >
                {waking ? (
                  <Loader2 className="size-4 animate-spin text-white" aria-hidden="true" />
                ) : draftAwake ? (
                  <Square className="size-3.5 fill-white text-white" aria-hidden="true" />
                ) : (
                  <Play className="size-4 fill-white text-white" aria-hidden="true" />
                )}
              </Button>
            ) : null}
            {panelOpen && !structureLocked ? (
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

        {wakeError && panelOpen ? (
          <p className="shrink-0 border-b border-border px-3 py-1.5 text-xs text-destructive">
            {wakeError}
          </p>
        ) : null}

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
