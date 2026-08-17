"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AppSearchField } from "@/components/builder/app-search-field";
import { Button } from "@/components/ui/button";
import { DaSelect } from "@/components/ui/da-select";
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

function seedQueryForField(key: string, label?: string): string {
  if (key === "email_service") return "email";
  if (key === "crm") return "crm";
  if (key.startsWith("app_")) return key.replace(/^app_/, "").replace(/_/g, " ");
  if (label) return label.replace(/which app did you mean by/i, "").replace(/[“”"]/g, "").trim();
  return "";
}

function isWebsiteField(key: string): boolean {
  return key.includes("website") || key.includes("url");
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
      {variant === "providers" ? null : (
        <p className="text-sm leading-relaxed text-muted-foreground">{t("questions.hint")}</p>
      )}
      {uiComponent.fields.map((field) => {
        const useAppSearch = variant === "providers" && !isWebsiteField(field.key);
        return (
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
            ) : useAppSearch ? (
              <AppSearchField
                value={values[field.key] ?? ""}
                seedQuery={seedQueryForField(field.key, field.label)}
                placeholder={t("providers.searchPlaceholder")}
                onChange={(next) => setValues((v) => ({ ...v, [field.key]: next }))}
              />
            ) : field.type === "select" && field.options?.length ? (
              <DaSelect
                value={values[field.key] ?? ""}
                placeholder={t(`questions.placeholders.${field.key}`, { defaultValue: "" })}
                options={field.options.map((opt) => ({
                  value: opt,
                  label: optionLabel(t, field.key, opt),
                }))}
                onChange={(next) => setValues((v) => ({ ...v, [field.key]: next }))}
              />
            ) : (
              <Input
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                placeholder={t(`questions.placeholders.${field.key}`, {
                  defaultValue: variant === "providers" ? t("questions.placeholders.tool_website") : "",
                })}
                className="h-10 rounded-xl bg-background/80"
              />
            )}
          </label>
        );
      })}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending} className="rounded-full">
        {pending ? t("questions.saving") : t("questions.continue")}
      </Button>
    </div>
  );
}
