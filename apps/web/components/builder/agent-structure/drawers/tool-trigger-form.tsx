"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ToolTriggerPicker } from "@/components/builder/agent-structure/drawers/tool-trigger-picker";
import {
  PipedreamPropFields,
} from "@/components/builder/pipedream-prop-fields";
import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RoundCheck } from "@/components/ui/round-check";
import { useTranslation } from "@/hooks/use-translation";
import { SAVED_CLOSE_DELAY_MS } from "@/components/builder/tool-config-form";
import { updateAgentTriggers } from "@/lib/actions/builder";
import {
  getIntegrationTriggerComponent,
  getTriggerDynamicOptions,
} from "@/lib/actions/integrations";
import type { AgentSpec } from "@/lib/domain/types";
import { resolveAppDisplayName, appsEquivalent } from "@/lib/integrations/app-grouping";
import {
  isPropValueFilled,
  isStructureRequiredProp,
  resolvePropCopy,
} from "@/lib/integrations/prop-labels";
import { cn } from "@/lib/utils";

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
  await queryClient.invalidateQueries({ queryKey: ["agents", agentId] });
  await queryClient.invalidateQueries({ queryKey: ["agents", agentId, "spec"] });
  await queryClient.invalidateQueries({ queryKey: ["agents", agentId, "graph"] });
  await queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
  await queryClient.invalidateQueries({ queryKey: ["agent-trigger-runtime", agentId] });
}

function toolTriggerNodeLabel(appId: string, appName?: string) {
  const name = (appName || "").trim() || resolveAppDisplayName(appId);
  return `Trigger ${name}`;
}

function TriggerPropFields({
  props,
  extraProps,
  setExtraProps,
  remoteOptions,
  loadingOptions,
  disabled,
  onRetryOptions,
}: {
  props: Array<{
    name: string;
    label: string;
    required: boolean;
    description?: string;
    type?: string;
    remote_options?: boolean;
  }>;
  extraProps: Record<string, string>;
  setExtraProps: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  remoteOptions: Record<string, Array<{ value: string; label: string }>>;
  loadingOptions: Record<string, boolean>;
  disabled?: boolean;
  onRetryOptions?: (name: string) => void;
}) {
  const { t } = useTranslation("structure");
  const defs = props.map((prop) => ({
    name: prop.name,
    label: prop.label,
    type: prop.type,
    required: prop.required,
    description: prop.description,
    options: remoteOptions[prop.name],
    optionsLoading: Boolean(loadingOptions[prop.name]),
    remoteOptions: prop.remote_options === true,
  }));
  return (
    <PipedreamPropFields
      props={defs}
      values={extraProps}
      disabled={disabled}
      selectPlaceholder={t("panel.toolConfigSelect")}
      searchPlaceholder={t("panel.toolConfigSearch")}
      onChange={(name, value) =>
        setExtraProps((prev) => ({ ...prev, [name]: value }))
      }
      onRetryOptions={onRetryOptions}
    />
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
  const existing = (spec?.triggers ?? []).find((row) => row.kind === "tool");
  const enabled = Boolean(existing?.enabled);
  const [on, setOn] = useState(enabled);
  const [appId, setAppId] = useState(existing?.appId || "");
  const [appName, setAppName] = useState(
    existing?.appId ? resolveAppDisplayName(existing.appId) : "",
  );
  const [componentId, setComponentId] = useState(existing?.componentId || "");
  const [componentLabel, setComponentLabel] = useState(existing?.label || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toolReady = Boolean(appId && componentId);
  const dirty =
    on !== enabled ||
    (on &&
      (appId !== (existing?.appId || "") || componentId !== (existing?.componentId || "")));
  const canSave = dirty && (!on || toolReady);

  async function save() {
    if (on && !toolReady) {
      setError(t("panel.toolTriggerRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
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
                  appId,
                  componentId,
                  label: toolTriggerNodeLabel(appId, appName),
                  extraProps: existing?.extraProps ?? {},
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
        <RoundCheck
          checked={on}
          onChange={(checked) => {
            setOn(checked);
            setError(null);
          }}
        />
        <div className="space-y-1">
          <Label className="cursor-pointer text-sm font-medium">
            {t("panel.toolTriggerEnable")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("panel.toolTriggerEnableHint")}</p>
        </div>
      </label>
      {on ? (
        <div className="space-y-3 rounded-2xl border border-brand/25 bg-brand/[0.04] p-3.5">
          <ToolTriggerPicker
            appId={appId}
            appName={appName}
            componentId={componentId}
            componentLabel={componentLabel}
            disabled={saving}
            onAppCleared={() => {
              setAppId("");
              setAppName("");
              setComponentId("");
              setComponentLabel("");
            }}
            onAppSelect={(app) => {
              setAppId(app.appId);
              setAppName(app.name);
              setComponentId("");
              setComponentLabel("");
            }}
            onEventChange={(nextId, nextLabel) => {
              setComponentId(nextId);
              setComponentLabel(nextLabel);
            }}
          />
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" disabled={saving || !canSave} onClick={() => void save()}>
        {saving ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t("panel.saving")}
          </>
        ) : (
          t("panel.save")
        )}
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
  onClose,
}: {
  agentId: string;
  spec?: AgentSpec | null;
  published?: boolean;
  connections: Array<{ id: string; provider: string; status: string; app_id?: string | null }>;
  onSaved?: () => void;
  /** Closes the panel a beat after a successful save — see ToolConfigForm. */
  onClose?: () => void;
}) {
  const { t } = useTranslation("structure");
  const queryClient = useQueryClient();
  const existing = (spec?.triggers ?? []).find((row) => row.kind === "tool");
  const [appId, setAppId] = useState(existing?.appId || "");
  const [appName, setAppName] = useState(
    existing?.appId ? resolveAppDisplayName(existing.appId) : "",
  );
  const [componentId, setComponentId] = useState(existing?.componentId || "");
  const [eventLabel, setEventLabel] = useState(existing?.label || "");
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
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const closeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState<
    Record<string, Array<{ value: string; label: string }>>
  >({});
  const [loadingOptions, setLoadingOptions] = useState<Record<string, boolean>>({});
  // Bumped when the account below gets linked: the event pickers reload with
  // that account's real choices instantly, instead of after a page refresh.
  const [connectionRefresh, setConnectionRefresh] = useState(0);

  const component = useQuery({
    queryKey: ["pd-trigger-component", componentId],
    queryFn: () => getIntegrationTriggerComponent(componentId),
    enabled: Boolean(componentId),
  });

  useEffect(() => {
    const props = component.data?.props ?? [];
    if (!componentId || props.length === 0) {
      setRemoteOptions({});
      setLoadingOptions({});
      return;
    }
    let cancelled = false;
    const loading: Record<string, boolean> = {};
    for (const prop of props) {
      if (prop.remote_options !== true) continue;
      loading[prop.name] = true;
    }
    setLoadingOptions(loading);
    for (const name of Object.keys(loading)) {
      void getTriggerDynamicOptions({
        componentId,
        prop: name,
        agentId,
        appId: appId || undefined,
      })
        .then((res) => {
          if (cancelled) return;
          setRemoteOptions((prev) => ({
            ...prev,
            [name]: (res.options ?? []).map((o) => ({
              value: String(o.value),
              label: String(o.label ?? o.value),
            })),
          }));
        })
        .finally(() => {
          if (cancelled) return;
          setLoadingOptions((prev) => ({ ...prev, [name]: false }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [component.data?.props, componentId, agentId, appId, connectionRefresh]);

  const connection = useMemo(() => {
    return connections.find((c) => {
      const slug = String(c.app_id || "");
      return appsEquivalent(slug, appId);
    });
  }, [appId, connections]);

  const connected = ["active", "connected", "ok"].includes(
    (connection?.status || "").toLowerCase(),
  );

  const allProps = component.data?.props ?? [];
  const requiredProps = allProps.filter((prop) => isStructureRequiredProp(prop));
  const optionalProps = allProps.filter((prop) => !isStructureRequiredProp(prop));

  async function save() {
    if (!appId || !componentId) {
      setError(t("panel.toolTriggerRequired"));
      return;
    }
    const missing = requiredProps.filter(
      (prop) => !isPropValueFilled(extraProps[prop.name]),
    );
    if (missing.length > 0) {
      const labels = missing
        .slice(0, 3)
        .map((prop) => resolvePropCopy(prop.name, { label: prop.label }).label);
      setError(
        t("panel.toolTriggerMissingFields", {
          fields: labels.join(", "),
          defaultValue: `Renseignez : ${labels.join(", ")}`,
        }),
      );
      return;
    }
    if (!connected) {
      setError(t("panel.toolTriggerNeedConnection", {
        defaultValue: "Connectez l’application avant d’enregistrer.",
      }));
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
            label: toolTriggerNodeLabel(appId, appName),
            extraProps,
            connectionId: connection?.id,
          },
        ],
      });
      await invalidateAgent(queryClient, agentId);
      onSaved?.();
      setSaved(true);
      if (onClose) {
        closeTimer.current = window.setTimeout(() => {
          closeTimer.current = null;
          onClose();
        }, SAVED_CLOSE_DELAY_MS);
      }
    } catch {
      setError(t("panel.triggersSaveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("panel.toolTriggerIntro")}</p>

      <ToolTriggerPicker
        appId={appId}
        appName={appName}
        componentId={componentId}
        componentLabel={eventLabel}
        disabled={saving}
        onAppCleared={() => {
          setAppId("");
          setAppName("");
          setComponentId("");
          setEventLabel("");
        }}
        onAppSelect={(app) => {
          setAppId(app.appId);
          setAppName(app.name);
          setComponentId("");
          setEventLabel("");
        }}
        onEventChange={(nextId, nextLabel) => {
          setComponentId(nextId);
          setEventLabel(nextLabel);
        }}
      />

      {appId ? (
        <IntegrationConnectionCard
          provider="pipedream"
          appId={appId}
          agentId={agentId}
          status={connected ? "connected" : "needs_setup"}
          connectionId={connection?.id}
          onConnected={() => setConnectionRefresh((v) => v + 1)}
          onChanged={() => setConnectionRefresh((v) => v + 1)}
        />
      ) : null}

      {requiredProps.length > 0 ? (
        <TriggerPropFields
          props={requiredProps}
          extraProps={extraProps}
          setExtraProps={setExtraProps}
          remoteOptions={remoteOptions}
          loadingOptions={loadingOptions}
          disabled={saving}
          onRetryOptions={() => setConnectionRefresh((v) => v + 1)}
        />
      ) : null}

      {optionalProps.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            className="group flex w-full items-center gap-1.5 py-0.5 text-left text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
          >
            <span>{t("panel.toolTriggerAdvanced")}</span>
            <ChevronDown
              className={cn(
                "size-3.5 opacity-70 transition-transform",
                advancedOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
          {advancedOpen ? (
            <div className="rounded-2xl border border-border/40 bg-muted/20 p-3">
              <TriggerPropFields
                props={optionalProps}
                extraProps={extraProps}
                setExtraProps={setExtraProps}
                remoteOptions={remoteOptions}
                loadingOptions={loadingOptions}
                disabled={saving}
                onRetryOptions={() => setConnectionRefresh((v) => v + 1)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {published ? (
        <p className="text-xs text-muted-foreground">{t("panel.toolTriggerPublishedHint")}</p>
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
    </div>
  );
}
