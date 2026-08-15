"use client";

import { Check, Loader2, Lock, MessageSquare, Timer } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { submitBuilderCapabilities } from "@/lib/actions/builder";
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
  const { t } = useTranslation(["builder", "errors"]);
  const [scheduleHourly, setScheduleHourly] = useState(
    () => fieldDefault(uiComponent.fields, "schedule_hourly") === "true",
  );
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || completed) return;
    setSubmitting(true);
    setErrorKey(null);
    setCompleted(true);
    onSubmitted?.();
    try {
      await submitBuilderCapabilities({
        runId,
        // Chat memory is always on by default — configured later in Structure if needed.
        memoryConversation: true,
        memorySemantic: false,
        knowledgeEnabled: false,
        scheduleHourly,
        contextNotes: "",
      });
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
      </div>

      {errorKey ? <p className="text-xs text-destructive">{t(errorKey)}</p> : null}

      <Button
        type="submit"
        size="default"
        className="h-10 w-full rounded-full text-sm font-medium sm:w-auto sm:min-w-[11rem]"
        disabled={submitting}
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
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
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
