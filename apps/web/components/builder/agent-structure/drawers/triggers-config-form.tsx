"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import { updateAgentTriggers } from "@/lib/actions/builder";
import type { AgentSpec } from "@/lib/domain/types";
import {
  DEFAULT_SCHEDULE_TIMING,
  WEEKDAY_OPTIONS,
  browserTimezone,
  buildScheduleCron,
  formatScheduleSummary,
  isScheduleTimingConfigured,
  parseScheduleCron,
  type ScheduleTiming,
} from "@/lib/schedule-cron";

function scheduleTrigger(spec?: AgentSpec | null) {
  return (spec?.triggers ?? []).find((t) => t.kind === "schedule" && t.enabled);
}

function toolTrigger(spec?: AgentSpec | null) {
  return (spec?.triggers ?? []).find((t) => t.kind === "tool" && t.enabled);
}

function toolTriggerPayload(spec?: AgentSpec | null) {
  const tool = toolTrigger(spec);
  if (!tool?.componentId) return [];
  return [
    {
      kind: "tool" as const,
      enabled: true,
      appId: tool.appId,
      componentId: tool.componentId,
      label: tool.label,
      extraProps: tool.extraProps,
    },
  ];
}

function hasEnabledSchedule(spec?: AgentSpec | null): boolean {
  return Boolean(scheduleTrigger(spec));
}

async function invalidateAgent(queryClient: ReturnType<typeof useQueryClient>, agentId: string) {
  await queryClient.invalidateQueries({ queryKey: ["agents", agentId, "spec"] });
  await queryClient.invalidateQueries({ queryKey: ["agents", agentId, "graph"] });
  await queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
}

/** Agent drawer: enable / disable the Schedule module only (no timing here). */
export function AgentScheduleToggle({
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
  const enabled = hasEnabledSchedule(spec);
  const [on, setOn] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = on !== enabled;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const timezone = browserTimezone();
      if (on) {
        const existing = scheduleTrigger(spec);
        const timing = parseScheduleCron(existing?.cron, existing?.timezone || timezone);
        const cron = isScheduleTimingConfigured(existing?.cron)
          ? buildScheduleCron(timing)
          : buildScheduleCron({ ...DEFAULT_SCHEDULE_TIMING, timezone });
        await updateAgentTriggers({
          agentId,
          triggers: [
            { kind: "chat", enabled: true },
            {
              kind: "schedule",
              enabled: true,
              cron,
              timezone: timing.timezone || timezone,
            },
            ...toolTriggerPayload(spec),
          ],
        });
      } else {
        await updateAgentTriggers({
          agentId,
          triggers: [{ kind: "chat", enabled: true }, ...toolTriggerPayload(spec)],
        });
      }
      await invalidateAgent(queryClient, agentId);
      onSaved?.();
      setSaved(true);
    } catch {
      setError(t("panel.triggersSaveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("panel.triggersIntro")}</p>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/60 p-4">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[var(--brand,#e36b2c)]"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            setSaved(false);
          }}
        />
        <div className="space-y-1">
          <Label className="cursor-pointer text-sm font-medium">
            {t("panel.triggersEnable")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("panel.triggersEnableHint")}</p>
        </div>
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved && !dirty ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{t("panel.saved")}</p>
      ) : null}
      <Button type="button" disabled={saving || !dirty} onClick={() => void save()}>
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

/** Schedule drawer: days of week + clock time. */
export function ScheduleTimingForm({
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
  const existing = scheduleTrigger(spec);
  const initial = useMemo(
    () => parseScheduleCron(existing?.cron, existing?.timezone || browserTimezone()),
    [existing?.cron, existing?.timezone],
  );
  const [timing, setTiming] = useState<ScheduleTiming>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dayLabels = useMemo(
    () => ({
      mon: t("panel.dayMon"),
      tue: t("panel.dayTue"),
      wed: t("panel.dayWed"),
      thu: t("panel.dayThu"),
      fri: t("panel.dayFri"),
      sat: t("panel.daySat"),
      sun: t("panel.daySun"),
      every: t("panel.dayEvery"),
    }),
    [t],
  );

  const currentCron = buildScheduleCron(timing);
  const persistedCron = existing?.cron ?? "";
  const dirty =
    currentCron !== persistedCron ||
    (timing.timezone || "") !== (existing?.timezone || browserTimezone());

  function toggleDay(cronDow: number) {
    setTiming((prev) => {
      const has = prev.days.includes(cronDow);
      const days = has ? prev.days.filter((d) => d !== cronDow) : [...prev.days, cronDow];
      return { ...prev, days: days.length ? days : prev.days };
    });
    setSaved(false);
  }

  async function save() {
    if (timing.days.length === 0) {
      setError(t("panel.triggersDaysRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    const cron = buildScheduleCron(timing);
    const timezone = timing.timezone || browserTimezone();
    try {
      await updateAgentTriggers({
        agentId,
        triggers: [
          { kind: "chat", enabled: true },
          { kind: "schedule", enabled: true, cron, timezone },
          ...toolTriggerPayload(spec),
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("panel.triggersTimingIntro")}</p>

      <div className="space-y-2">
        <Label>{t("panel.triggersDays")}</Label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_OPTIONS.map((day) => {
            const active = timing.days.includes(day.cronDow);
            return (
              <button
                key={day.key}
                type="button"
                onClick={() => toggleDay(day.cronDow)}
                className={
                  active
                    ? "rounded-full border border-[var(--brand,#e36b2c)] bg-[var(--brand,#e36b2c)]/15 px-3 py-1.5 text-xs font-medium"
                    : "rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground"
                }
              >
                {dayLabels[day.key as keyof typeof dayLabels]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="schedule-hour">{t("panel.triggersHour")}</Label>
          <select
            id="schedule-hour"
            className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
            value={timing.hour}
            onChange={(e) => {
              setTiming((prev) => ({ ...prev, hour: Number(e.target.value) }));
              setSaved(false);
            }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="schedule-minute">{t("panel.triggersMinute")}</Label>
          <select
            id="schedule-minute"
            className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
            value={timing.minute}
            onChange={(e) => {
              setTiming((prev) => ({ ...prev, minute: Number(e.target.value) }));
              setSaved(false);
            }}
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="rounded-2xl border border-border/50 px-4 py-3 text-sm text-muted-foreground">
        {formatScheduleSummary(timing, dayLabels)}
        {timing.timezone ? ` · ${timing.timezone}` : ""}
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved && !dirty ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{t("panel.saved")}</p>
      ) : null}

      <Button type="button" disabled={saving || !dirty} onClick={() => void save()}>
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

/** @deprecated Prefer AgentScheduleToggle / ScheduleTimingForm */
export function TriggersConfigForm(props: {
  agentId: string;
  spec?: AgentSpec | null;
  onSaved?: () => void;
  compact?: boolean;
}) {
  if (props.compact) {
    return <ScheduleTimingForm {...props} />;
  }
  return <AgentScheduleToggle {...props} />;
}
