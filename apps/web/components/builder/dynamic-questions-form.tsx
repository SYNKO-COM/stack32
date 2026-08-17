"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/use-translation";
import { submitBuilderQuestions, submitBuilderProviders } from "@/lib/actions/builder";
import type { BuilderUiComponent } from "@/lib/domain/types";

function fieldLabel(
  t: (key: string, opts?: Record<string, string>) => string,
  key: string,
  fallback?: string,
): string {
  return t(`questions.fields.${key}`, {
    defaultValue: fallback && !fallback.includes("_") ? fallback : key,
  });
}

function optionLabel(
  t: (key: string, opts?: Record<string, string>) => string,
  fieldKey: string,
  option: string,
): string {
  return t(`questions.options.${fieldKey}.${option}`, {
    defaultValue: t(`questions.options.${option}`, { defaultValue: option }),
  });
}

export function DynamicQuestionsForm({
  uiComponent,
  runId,
  onSubmitted,
  variant = "questions",
}: {
  uiComponent: BuilderUiComponent;
  runId: string;
  onSubmitted?: () => void;
  variant?: "questions" | "providers";
}) {
  const { t } = useTranslation("builder");
  const queryClient = useQueryClient();
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
        setError(t("questions.required"));
        return;
      }
    }
    startTransition(async () => {
      try {
        onSubmitted?.();
        await (variant === "providers"
          ? submitBuilderProviders({ runId, answers: values })
          : submitBuilderQuestions({ runId, answers: values }));
        void queryClient.invalidateQueries({ queryKey: ["builder"] });
        void queryClient.invalidateQueries({ queryKey: ["agents"] });
      } catch {
        setError(t("questions.error"));
      }
    });
  };

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {variant === "providers" ? t("providers.prompt") : t("questions.hint")}
      </p>
      {uiComponent.fields.map((field) => (
        <label key={field.key} className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground/90">
            {field.label && !field.label.includes("_")
              ? field.label
              : fieldLabel(t, field.key, field.label)}
            {field.required ? " *" : ""}
          </span>
          {field.type === "textarea" ? (
            <Textarea
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              rows={3}
              placeholder={t(`questions.placeholders.${field.key}`, { defaultValue: "" })}
            />
          ) : field.type === "select" && field.options?.length ? (
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {optionLabel(t, field.key, opt)}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              placeholder={t(`questions.placeholders.${field.key}`, { defaultValue: "" })}
            />
          )}
        </label>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending} className="rounded-full">
        {pending ? t("questions.saving") : t("questions.continue")}
      </Button>
    </div>
  );
}
