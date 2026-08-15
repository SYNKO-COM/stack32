"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import { LLM_PROVIDERS, modelsForProvider } from "@/lib/ai/llm-catalog";
import { agentServiceErrorKey } from "@/lib/ai/agent-service-errors";
import { submitLiveLlmSecret, updateAgentModel } from "@/lib/actions/builder";
import type { ProductNode } from "@/lib/domain/product-agent-graph";
import { cn } from "@/lib/utils";

const selectClass = cn(
  "flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

export function ModelConfigForm({
  agentId,
  node,
  onSaved,
}: {
  agentId: string;
  node: ProductNode;
  onSaved?: () => void;
}) {
  const { t } = useTranslation(["structure", "builder", "errors"]);
  const queryClient = useQueryClient();
  const current = node.subtitle?.split(" · ") ?? [];
  const [provider, setProvider] = useState(
    () => current[0]?.toLowerCase() || "openai",
  );
  const [modelId, setModelId] = useState(() => current[1] ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const models = useMemo(() => modelsForProvider(provider), [provider]);

  useEffect(() => {
    if (models.some((m) => m.id === modelId)) return;
    setModelId(models[0]?.id ?? "");
  }, [provider, models, modelId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!provider || !modelId) {
      setErrorKey("errors:form.required");
      return;
    }
    const needsKey = node.configurationStatus !== "ready" || Boolean(apiKey.trim());
    if (needsKey && apiKey.trim().length < 8) {
      setErrorKey("errors:form.required");
      return;
    }
    setSubmitting(true);
    setErrorKey(null);
    setSaved(false);
    try {
      if (apiKey.trim()) {
        await submitLiveLlmSecret({
          agentId,
          provider,
          apiKey: apiKey.trim(),
          modelId,
        });
      } else {
        await updateAgentModel({ agentId, provider, modelId });
      }
      setApiKey("");
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["agents", agentId, "spec"] });
      await queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
      onSaved?.();
    } catch (err) {
      setErrorKey(agentServiceErrorKey(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="structure-model-provider">{t("structure:panel.provider")}</Label>
        <select
          id="structure-model-provider"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setSaved(false);
          }}
          disabled={submitting}
          className={selectClass}
        >
          {LLM_PROVIDERS.map((option) => (
            <option key={option} value={option}>
              {t(`builder:secrets.providers.${option}`, { defaultValue: option })}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="structure-model-id">{t("structure:panel.model")}</Label>
        <select
          id="structure-model-id"
          value={modelId}
          onChange={(e) => {
            setModelId(e.target.value);
            setSaved(false);
          }}
          disabled={submitting || models.length === 0}
          className={selectClass}
        >
          {models.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="structure-model-key">{t("structure:panel.apiKey")}</Label>
        <div className="relative">
          <Input
            id="structure-model-key"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaved(false);
            }}
            disabled={submitting}
            placeholder={
              node.configurationStatus === "ready"
                ? t("structure:panel.apiKeyKeep")
                : t("builder:secrets.apiKeyPlaceholder")
            }
            className="h-10 rounded-xl pr-10"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? t("builder:secrets.hide") : t("builder:secrets.show")}
          >
            {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t("structure:panel.apiKeyHint")}</p>
      </div>

      {errorKey ? (
        <p className="text-sm text-destructive">{t(errorKey)}</p>
      ) : saved ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("structure:panel.saved")}</p>
      ) : null}

      <Button type="submit" className="w-full rounded-xl" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("structure:panel.saving")}
          </>
        ) : (
          t("structure:panel.save")
        )}
      </Button>
    </form>
  );
}
