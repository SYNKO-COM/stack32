"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/use-translation";
import { submitBuilderQuestions } from "@/lib/actions/builder";
import type { BuilderUiComponent } from "@/lib/domain/types";

export function DynamicQuestionsForm({
  uiComponent,
  runId,
  onSubmitted,
}: {
  uiComponent: BuilderUiComponent;
  runId: string;
  onSubmitted?: () => void;
}) {
  const { t } = useTranslation("builder");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const field of uiComponent.fields) {
      init[field.key] = field.suggested_value ?? "";
    }
    return init;
  });

  const submit = () => {
    setError(null);
    for (const field of uiComponent.fields) {
      if (field.required && !(values[field.key] || "").trim()) {
        setError(t("questions.required", { defaultValue: "Please fill required fields." }));
        return;
      }
    }
    startTransition(async () => {
      try {
        await submitBuilderQuestions({ runId, answers: values });
        onSubmitted?.();
      } catch {
        setError(t("questions.error", { defaultValue: "Could not save answers." }));
      }
    });
  };

  return (
    <div className="mt-4 space-y-3">
      {uiComponent.fields.map((field) => (
        <label key={field.key} className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">
            {field.label || field.key}
            {field.required ? " *" : ""}
          </span>
          {field.type === "textarea" ? (
            <Textarea
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              rows={3}
            />
          ) : field.type === "select" && field.options?.length ? (
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            />
          )}
        </label>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending
          ? t("questions.saving", { defaultValue: "Saving…" })
          : t("questions.continue", { defaultValue: "Continue" })}
      </Button>
    </div>
  );
}
