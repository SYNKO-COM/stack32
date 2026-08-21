"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import {
  getAgentTriggerRuntime,
  startAgentTriggerListen,
  updateAgentTriggers,
} from "@/lib/actions/builder";
import {
  getIntegrationTriggerComponent,
  searchIntegrationApps,
  searchIntegrationTriggers,
} from "@/lib/actions/integrations";
import type { AgentSpec } from "@/lib/domain/types";

function schedulePayload(spec?: AgentSpec | null) {
  const schedule = (spec?.triggers ?? []).find((t) => t.kind === "schedule" && t.enabled);
  if (!schedule) return [];
  return [
    {
      kind: "schedule" as const,
      enabled: true,
      cron: schedule.cron,
      timezone: schedule.timezone,
    },
  ];
}

async function invalidateAgent(queryClient: ReturnType<typeof useQueryClient>, agentId: string) {
  await queryClient.invalidateQueries({ queryKey: ["agents", agentId, "spec"] });
  await queryClient.invalidateQueries({ queryKey: ["agents", agentId, "graph"] });
  await queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
  await queryClient.invalidateQueries({ queryKey: ["agent-trigger-runtime", agentId] });
}

export function ToolTriggerListenButton({
  agentId,
  published,
  configured,
}: {
  agentId: string;
  published?: boolean;
  configured: boolean;
}) {
  const { t } = useTranslation("structure");
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtime = useQuery({
    queryKey: ["agent-trigger-runtime", agentId],
    queryFn: () => getAgentTriggerRuntime(agentId),
    enabled: configured,
    refetchInterval: (query) =>
      query.state.data?.status === "listening" ? 2500 : false,
  });

  if (!configured) return null;
  if (published) {
    return (
      <p className="rounded-2xl border border-border/60 px-4 py-3 text-sm text-muted-foreground">
        {t("panel.toolTriggerPublishedHint")}
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 p-3">
      <p className="text-sm text-muted-foreground">{t("panel.toolTriggerListenHint")}</p>
      {runtime.data?.status === "listening" ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          {t("panel.toolTriggerListening", {
            until: runtime.data.listeningUntil
              ? new Date(runtime.data.listeningUntil).toLocaleTimeString()
              : "5 min",
          })}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="button"
        className="rounded-full"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void startAgentTriggerListen(agentId)
            .then(() =>
              queryClient.invalidateQueries({ queryKey: ["agent-trigger-runtime", agentId] }),
            )
            .catch(() => setError(t("panel.toolTriggerListenError")))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? t("panel.saving") : t("panel.toolTriggerListen")}
      </Button>
    </div>
  );
}

export function AgentToolTriggerToggle({
  agentId,
  spec,
  onSaved,
}: {
  agentId: string;
  spec?: AgentSpec | null;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("structure");
  const queryClient = useQueryClient();
  const enabled = Boolean((spec?.triggers ?? []).find((row) => row.kind === "tool" && row.enabled));
  const [on, setOn] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const tool = (spec?.triggers ?? []).find((row) => row.kind === "tool");
      await updateAgentTriggers({
        agentId,
        triggers: [
          { kind: "chat", enabled: true },
          ...schedulePayload(spec),
                  ...(on
            ? [
                {
                  kind: "tool" as const,
                  enabled: true,
                  appId: tool?.appId || "",
                  componentId: tool?.componentId || "",
                  label: tool?.label || t("panel.toolTriggerDefaultLabel"),
                  extraProps: tool?.extraProps ?? {},
                },
              ]
            : []),
        ],
      });
      await invalidateAgent(queryClient, agentId);
      onSaved?.();
    } catch {
      setError(t("panel.triggersSaveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/60 p-4">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[var(--brand,#e36b2c)]"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        <div className="space-y-1">
          <Label className="cursor-pointer text-sm font-medium">
            {t("panel.toolTriggerEnable")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("panel.toolTriggerEnableHint")}</p>
        </div>
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" disabled={saving || on === enabled} onClick={() => void save()}>
        {saving ? t("panel.saving") : t("panel.save")}
      </Button>
    </div>
  );
}

export function ToolTriggerConfigForm({
  agentId,
  spec,
  published,
  connections,
  onSaved,
}: {
  agentId: string;
  spec?: AgentSpec | null;
  published?: boolean;
  connections: Array<{ id: string; provider: string; status: string; app_id?: string | null }>;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("structure");
  const queryClient = useQueryClient();
  const existing = (spec?.triggers ?? []).find((row) => row.kind === "tool");
  const [appQuery, setAppQuery] = useState(existing?.appId || "");
  const [appId, setAppId] = useState(existing?.appId || "");
  const [componentId, setComponentId] = useState(existing?.componentId || "");
  const [label, setLabel] = useState(existing?.label || "");
  const [extraProps, setExtraProps] = useState<Record<string, string>>(() => {
    const src = existing?.extraProps || {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(src)) {
      if (value == null) continue;
      out[key] = String(value);
    }
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const apps = useQuery({
    queryKey: ["pd-apps", appQuery],
    queryFn: () => searchIntegrationApps(appQuery || appId || "gmail", 12),
    enabled: true,
  });
  const triggers = useQuery({
    queryKey: ["pd-triggers", appId],
    queryFn: () => searchIntegrationTriggers("", appId, 80),
    enabled: Boolean(appId),
  });
  const component = useQuery({
    queryKey: ["pd-trigger-component", componentId],
    queryFn: () => getIntegrationTriggerComponent(componentId),
    enabled: Boolean(componentId),
  });
  const runtime = useQuery({
    queryKey: ["agent-trigger-runtime", agentId],
    queryFn: () => getAgentTriggerRuntime(agentId),
    refetchInterval: (query) =>
      query.state.data?.status === "listening" ? 2500 : false,
  });

  useEffect(() => {
    if (component.data?.name && !label) setLabel(component.data.name);
  }, [component.data?.name, label]);

  const connection = useMemo(() => {
    const needle = appId.replace(/-/g, "_").toLowerCase();
    return connections.find((c) => {
      const slug = String(c.app_id || "").replace(/-/g, "_").toLowerCase();
      return slug === needle || slug.includes(needle) || needle.includes(slug);
    });
  }, [appId, connections]);

  const connected = ["active", "connected", "ok"].includes(
    (connection?.status || "").toLowerCase(),
  );

  async function save() {
    if (!appId || !componentId) {
      setError(t("panel.toolTriggerRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateAgentTriggers({
        agentId,
        triggers: [
          { kind: "chat", enabled: true },
          ...schedulePayload(spec),
          {
            kind: "tool",
            enabled: true,
            appId,
            componentId,
            label: label || component.data?.name || componentId,
            extraProps,
            connectionId: connection?.id,
          },
        ],
      });
      await invalidateAgent(queryClient, agentId);
      onSaved?.();
      setSaved(true);
    } catch {
      setError(t("panel.triggersSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function listen() {
    setListening(true);
    setError(null);
    try {
      await startAgentTriggerListen(agentId);
      await queryClient.invalidateQueries({ queryKey: ["agent-trigger-runtime", agentId] });
    } catch {
      setError(t("panel.toolTriggerListenError"));
    } finally {
      setListening(false);
    }
  }

  const status = runtime.data?.status || "idle";
  const listeningUntil = runtime.data?.listeningUntil;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("panel.toolTriggerIntro")}</p>

      <div className="space-y-1.5">
        <Label>{t("panel.toolTriggerApp")}</Label>
        <Input
          value={appQuery}
          onChange={(e) => setAppQuery(e.target.value)}
          placeholder="Gmail, Google Sheets, Slack…"
        />
        <div className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-xl border border-border/60 p-1">
          {(apps.data?.apps ?? []).slice(0, 8).map((app) => (
            <button
              key={app.appId}
              type="button"
              className={`rounded-lg px-2 py-1.5 text-left text-sm ${
                appId === app.appId ? "bg-brand/15 font-medium" : "hover:bg-foreground/5"
              }`}
              onClick={() => {
                setAppId(app.appId);
                setAppQuery(app.name);
                setComponentId("");
              }}
            >
              {app.name}
            </button>
          ))}
        </div>
      </div>

      {appId ? (
        <div className="space-y-1.5">
          <Label>{t("panel.toolTriggerEvent")}</Label>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-border/60 p-1">
            {(triggers.data?.triggers ?? []).map((row) => (
              <button
                key={row.triggerId}
                type="button"
                className={`rounded-lg px-2 py-1.5 text-left text-sm ${
                  componentId === row.triggerId ? "bg-brand/15 font-medium" : "hover:bg-foreground/5"
                }`}
                onClick={() => {
                  setComponentId(row.triggerId);
                  setLabel(row.name);
                }}
              >
                <span className="block">{row.name}</span>
                {row.summary ? (
                  <span className="block text-[11px] text-muted-foreground">{row.summary}</span>
                ) : null}
              </button>
            ))}
            {triggers.isLoading ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t("panel.saving")}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {appId ? (
        <IntegrationConnectionCard
          provider="pipedream"
          appId={appId}
          agentId={agentId}
          status={connected ? "connected" : "needs_setup"}
          connectionId={connection?.id}
        />
      ) : null}

      {(component.data?.props ?? []).length > 0 ? (
        <div className="space-y-2">
          {(component.data?.props ?? []).map((prop) => (
            <div key={prop.name} className="space-y-1">
              <Label htmlFor={`tp-${prop.name}`}>
                {prop.label}
                {prop.required ? " *" : ""}
              </Label>
              <Input
                id={`tp-${prop.name}`}
                value={extraProps[prop.name] ?? ""}
                onChange={(e) =>
                  setExtraProps((prev) => ({ ...prev, [prop.name]: e.target.value }))
                }
                placeholder={prop.description || prop.name}
              />
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{t("panel.saved")}</p>
      ) : null}

      <Button type="button" disabled={saving || !appId || !componentId} onClick={() => void save()}>
        {saving ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t("panel.saving")}
          </>
        ) : (
          t("panel.save")
        )}
      </Button>

      <div className="rounded-2xl border border-border/60 p-3 text-sm">
        {published ? (
          <p className="text-muted-foreground">{t("panel.toolTriggerPublishedHint")}</p>
        ) : (
          <>
            <p className="text-muted-foreground">{t("panel.toolTriggerListenHint")}</p>
            {status === "listening" ? (
              <p className="mt-2 text-emerald-700 dark:text-emerald-300">
                {t("panel.toolTriggerListening", {
                  until: listeningUntil
                    ? new Date(listeningUntil).toLocaleTimeString()
                    : "5 min",
                })}
              </p>
            ) : null}
            <Button
              type="button"
              className="mt-3 rounded-full"
              disabled={listening || !componentId}
              onClick={() => void listen()}
            >
              {listening ? t("panel.saving") : t("panel.toolTriggerListen")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
