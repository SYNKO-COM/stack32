"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [memoryConversation, setMemoryConversation] = useState(
    () => fieldDefault(uiComponent.fields, "memory_conversation") !== "false",
  );
  const [memorySemantic, setMemorySemantic] = useState(
    () => fieldDefault(uiComponent.fields, "memory_semantic") === "true",
  );
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(
    () => fieldDefault(uiComponent.fields, "knowledge_enabled") === "true",
  );
  const [scheduleHourly, setScheduleHourly] = useState(
    () => fieldDefault(uiComponent.fields, "schedule_hourly") === "true",
  );
  const [contextNotes, setContextNotes] = useState(() =>
    fieldDefault(uiComponent.fields, "context_notes"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || completed) return;
    setSubmitting(true);
    setErrorKey(null);
    // Hide the form immediately and let BuildView show live activity + Stop.
    setCompleted(true);
    onSubmitted?.();
    try {
      await submitBuilderCapabilities({
        runId,
        memoryConversation,
        memorySemantic,
        knowledgeEnabled,
        scheduleHourly,
        contextNotes: contextNotes.trim(),
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
      <ToggleRow
        id="cap-memory-conversation"
        label={t("builder:capabilities.memoryConversation")}
        hint={t("builder:capabilities.memoryConversationHint")}
        checked={memoryConversation}
        disabled={submitting}
        onChange={setMemoryConversation}
      />
      <ToggleRow
        id="cap-memory-semantic"
        label={t("builder:capabilities.memorySemantic")}
        hint={t("builder:capabilities.memorySemanticHint")}
        checked={memorySemantic}
        disabled={submitting}
        onChange={setMemorySemantic}
      />
      <ToggleRow
        id="cap-knowledge"
        label={t("builder:capabilities.knowledge")}
        hint={t("builder:capabilities.knowledgeHint")}
        checked={knowledgeEnabled}
        disabled={submitting}
        onChange={setKnowledgeEnabled}
      />
      <ToggleRow
        id="cap-schedule"
        label={t("builder:capabilities.scheduleHourly")}
        hint={t("builder:capabilities.scheduleHourlyHint")}
        checked={scheduleHourly}
        disabled={submitting}
        onChange={setScheduleHourly}
      />

      <div className="space-y-1.5">
        <Label htmlFor="cap-notes">{t("builder:capabilities.contextNotes")}</Label>
        <Textarea
          id="cap-notes"
          value={contextNotes}
          onChange={(e) => setContextNotes(e.target.value)}
          disabled={submitting}
          rows={3}
          placeholder={t("builder:capabilities.contextNotesPlaceholder")}
          className="rounded-xl bg-background/40"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">{t("builder:capabilities.appsComingSoon")}</p>

      {errorKey ? <p className="text-xs text-destructive">{t(errorKey)}</p> : null}

      <Button type="submit" size="sm" className="rounded-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
            {t("builder:capabilities.submitting")}
          </>
        ) : (
          t("builder:capabilities.continue")
        )}
      </Button>
    </form>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border border-border/50 bg-background/30 px-3 py-2.5",
        disabled && "opacity-60",
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-4 rounded border-border"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 text-left">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
