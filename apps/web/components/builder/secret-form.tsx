"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { DaSelect } from "@/components/ui/da-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  submitBuilderSecret,
  submitLiveLlmSecret,
} from "@/lib/actions/builder";
import { agentServiceErrorKey } from "@/lib/ai/agent-service-errors";
import type { BuilderUiComponent } from "@/lib/domain/types";
import { useTranslation } from "@/hooks/use-translation";

const FALLBACK_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "mistral",
  "groq",
  "openrouter",
] as const;

interface SecretFormProps {
  uiComponent: BuilderUiComponent;
  runId?: string;
  agentId: string;
  onSubmitted?: () => void;
}

function fieldDefault(fields: BuilderUiComponent["fields"], key: string): string {
  return fields.find((f) => f.key === key)?.suggested_value ?? "";
}

export function SecretForm({ uiComponent, runId, agentId, onSubmitted }: SecretFormProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation(["builder", "errors"]);
  const [provider, setProvider] = useState(
    () => fieldDefault(uiComponent.fields, "provider") || "openai",
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || completed) return;
    if (!apiKey.trim() || apiKey.trim().length < 8) {
      setErrorKey("errors:form.required");
      return;
    }
    setSubmitting(true);
    setErrorKey(null);
    setCompleted(true);
    onSubmitted?.();
    try {
      if (uiComponent.context === "live" || !runId) {
        await submitLiveLlmSecret({
          agentId,
          provider,
          apiKey: apiKey.trim(),
        });
      } else {
        await submitBuilderSecret({
          runId,
          provider,
          apiKey: apiKey.trim(),
        });
      }
      setApiKey("");
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
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("builder:secrets.secureNotice")}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="secret-provider">{t("builder:secrets.provider")}</Label>
        <DaSelect
          id="secret-provider"
          value={provider}
          disabled={submitting}
          options={FALLBACK_PROVIDERS.map((option) => ({
            value: option,
            label: t(`builder:secrets.providers.${option}`, { defaultValue: option }),
          }))}
          onChange={setProvider}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="secret-api-key">{t("builder:secrets.apiKey")}</Label>
        <div className="relative">
          <Input
            id="secret-api-key"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            disabled={submitting}
            placeholder={t("builder:secrets.apiKeyPlaceholder")}
            className="rounded-xl bg-background/40 pr-10 font-mono text-sm"
          />
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? t("builder:secrets.hide") : t("builder:secrets.show")}
          >
            {showKey ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("builder:secrets.byokHint")}</p>
      </div>

      {errorKey ? <p className="text-xs text-destructive">{t(errorKey)}</p> : null}

      <Button type="submit" size="sm" className="rounded-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
            {t("builder:secrets.submitting")}
          </>
        ) : (
          t("builder:secrets.continue")
        )}
      </Button>
    </form>
  );
}
