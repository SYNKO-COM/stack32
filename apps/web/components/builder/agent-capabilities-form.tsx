"use client";

import { Check, Loader2, Lock, MessageSquare, Timer, Zap } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AppSearchField } from "@/components/builder/app-search-field";
import { Button } from "@/components/ui/button";
import { DaSelect } from "@/components/ui/da-select";
import { Label } from "@/components/ui/label";
import { submitBuilderCapabilities } from "@/lib/actions/builder";
import { searchIntegrationTriggers } from "@/lib/actions/integrations";
import { agentServiceErrorKey } from "@/lib/ai/agent-service-errors";
import type { BuilderUiComponent } from "@/lib/domain/types";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

interface CapabilitiesFormProps {
  uiComponent: BuilderUiComponent;
  runId: string;
  onSubmitted?: () => void;
}

function fieldDefault(fields: BuilderUiComponent["fields"], key: string): string {
  return fields.find((f) => f.key === key)?.suggested_value ?? "";
}

export function AgentCapabilitiesForm({
  uiComponent,
  runId,
  onSubmitted,
}: CapabilitiesFormProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation(["builder", "errors"]);
  const [scheduleHourly, setScheduleHourly] = useState(
    () => fieldDefault(uiComponent.fields, "schedule_hourly") === "true",
  );
  const [toolTrigger, setToolTrigger] = useState(false);
  const [appId, setAppId] = useState("");
  const [appName, setAppName] = useState("");
  const [componentId, setComponentId] = useState("");
  const [componentLabel, setComponentLabel] = useState("");
  const [events, setEvents] = useState<Array<{ value: string; label: string }>>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!toolTrigger || !appId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setEventsLoading(true);
    void searchIntegrationTriggers("", appId, 80)
      .then((result) => {
        if (cancelled) return;
        setEvents(
          result.triggers.map((row) => ({
            value: row.triggerId,
            label: row.name || row.triggerId,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toolTrigger, appId]);

  const toolReady = Boolean(appId && componentId);
  const canSubmit = !toolTrigger || toolReady;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || completed || !canSubmit) return;
    setSubmitting(true);
    setErrorKey(null);
    setCompleted(true);
    onSubmitted?.();
    try {
      await submitBuilderCapabilities({
        runId,
        memoryConversation: true,
        memorySemantic: false,
        knowledgeEnabled: false,
        scheduleHourly,
        toolTrigger,
        toolTriggerAppId: toolTrigger ? appId : null,
        toolTriggerComponentId: toolTrigger ? componentId : null,
        toolTriggerLabel: toolTrigger ? componentLabel || componentId : null,
        contextNotes: "",
      });
      void queryClient.invalidateQueries({ queryKey: ["builder"] });
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (err) {
      setCompleted(false);
      setErrorKey(agentServiceErrorKey(err));
      setSubmitting(false);
    }
  };

  if (completed) {
    return null;
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mt-3 space-y-3 border-t border-border/60 pt-3"
    >
      <p className="text-xs text-muted-foreground">{t("builder:capabilities.hint")}</p>

      <div className="space-y-2">
        <TriggerOption
          icon={<MessageSquare className="size-4" aria-hidden="true" />}
          label={t("builder:capabilities.triggerChat")}
          hint={t("builder:capabilities.triggerChatHint")}
          checked
          locked
          badge={t("builder:capabilities.required")}
          disabled={submitting}
        />
        <TriggerOption
          icon={<Timer className="size-4" aria-hidden="true" />}
          label={t("builder:capabilities.scheduleHourly")}
          hint={t("builder:capabilities.scheduleHourlyHint")}
          checked={scheduleHourly}
          disabled={submitting}
          onChange={setScheduleHourly}
        />
        <TriggerOption
          icon={<Zap className="size-4" aria-hidden="true" />}
          label={t("builder:capabilities.toolTrigger")}
          hint={t("builder:capabilities.toolTriggerHint")}
          checked={toolTrigger}
          disabled={submitting}
          onChange={(next) => {
            setToolTrigger(next);
            if (!next) {
              setAppId("");
              setAppName("");
              setComponentId("");
              setComponentLabel("");
              setEvents([]);
            }
          }}
        />
      </div>

      {toolTrigger ? (
        <div className="space-y-3 rounded-2xl border border-brand/25 bg-brand/[0.04] p-3.5">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t("builder:capabilities.toolTriggerApp")}
            </Label>
            <AppSearchField
              value={appName || appId}
              disabled={submitting}
              placeholder={t("builder:capabilities.toolTriggerSearch")}
              onChange={() => {
                setAppId("");
                setComponentId("");
                setComponentLabel("");
              }}
              onSelect={(app) => {
                setAppId(app.appId);
                setAppName(app.name);
                setComponentId("");
                setComponentLabel("");
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t("builder:capabilities.toolTriggerEvent")}
            </Label>
            {eventsLoading ? (
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {t("builder:capabilities.toolTriggerLoading")}
              </p>
            ) : (
              <DaSelect
                value={componentId}
                disabled={submitting || !appId || events.length === 0}
                placeholder={
                  appId
                    ? events.length === 0
                      ? t("builder:capabilities.toolTriggerEmpty")
                      : t("builder:capabilities.toolTriggerEventPlaceholder")
                    : t("builder:capabilities.toolTriggerPickAppFirst")
                }
                options={events.map((row) => ({
                  value: row.value,
                  label: row.label,
                }))}
                onChange={(value) => {
                  setComponentId(value);
                  setComponentLabel(events.find((row) => row.value === value)?.label || value);
                }}
              />
            )}
          </div>
          {!toolReady ? (
            <p className="text-[11px] text-muted-foreground">
              {t("builder:capabilities.toolTriggerRequired")}
            </p>
          ) : null}
        </div>
      ) : null}

      {errorKey ? <p className="text-xs text-destructive">{t(errorKey)}</p> : null}

      <Button
        type="submit"
        size="default"
        className="h-10 w-full rounded-full text-sm font-medium sm:w-auto sm:min-w-[11rem]"
        disabled={submitting || !canSubmit}
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("builder:capabilities.submitting")}
          </>
        ) : (
          t("builder:capabilities.continue")
        )}
      </Button>
    </form>
  );
}

function TriggerOption({
  icon,
  label,
  hint,
  checked,
  locked = false,
  badge,
  disabled,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  locked?: boolean;
  badge?: string;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  const interactive = !locked && Boolean(onChange);

  return (
    <button
      type="button"
      disabled={disabled || locked}
      aria-pressed={checked}
      aria-disabled={locked || disabled}
      onClick={() => {
        if (!interactive || disabled) return;
        onChange?.(!checked);
      }}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors",
        checked
          ? "border-brand/35 bg-brand/[0.08]"
          : "border-border/60 bg-background/50 hover:border-border hover:bg-foreground/[0.03]",
        locked && "cursor-default",
        interactive && !disabled && "cursor-pointer",
        disabled && "opacity-60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          checked
            ? "border-brand bg-brand text-white shadow-sm"
            : "border-border/80 bg-background text-transparent",
        )}
        aria-hidden="true"
      >
        {checked ? <Check className="size-3.5 stroke-[2.5]" /> : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="text-brand/80">{icon}</span>
            {label}
          </span>
          {badge ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium tracking-wide text-brand uppercase">
              <Lock className="size-2.5" aria-hidden="true" />
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </span>
      </span>
    </button>
  );
}
