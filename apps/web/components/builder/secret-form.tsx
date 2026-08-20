"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { DaSelect } from "@/components/ui/da-select";
import { Label } from "@/components/ui/label";
import { updateAgentModel, submitBuilderSecret } from "@/lib/actions/builder";
import { listAgentConnections } from "@/lib/actions/connections";
import { agentServiceErrorKey } from "@/lib/ai/agent-service-errors";
import {
  LIVE_LLM_PROVIDERS,
  modelsForProvider,
  pipedreamAppForLlmProvider,
  type LiveLlmProviderId,
} from "@/lib/ai/llm-catalog";
import type { BuilderUiComponent } from "@/lib/domain/types";
import { useTranslation } from "@/hooks/use-translation";

interface SecretFormProps {
  uiComponent: BuilderUiComponent;
  runId?: string;
  agentId: string;
  onSubmitted?: () => void;
}

function fieldDefault(fields: BuilderUiComponent["fields"], key: string): string {
  return fields.find((f) => f.key === key)?.suggested_value ?? "";
}

function normalizeLiveProvider(raw: string | undefined): LiveLlmProviderId {
  const value = (raw || "openai").toLowerCase();
  return (LIVE_LLM_PROVIDERS as readonly string[]).includes(value)
    ? (value as LiveLlmProviderId)
    : "openai";
}

/**
 * Live / Build LLM gate — connect the provider via Pipedream (no pasted API keys).
 * Model id is chosen in Stack32 and sent to LiteLLM; Pipedream only holds the account key.
 */
export function SecretForm({ uiComponent, runId, agentId, onSubmitted }: SecretFormProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation(["builder", "structure", "errors"]);
  const [provider, setProvider] = useState<LiveLlmProviderId>(() =>
    normalizeLiveProvider(fieldDefault(uiComponent.fields, "provider")),
  );
  const [modelId, setModelId] = useState(
    () => fieldDefault(uiComponent.fields, "model_id") || "",
  );
  const [completed, setCompleted] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const { data: connectionPayload, isFetching: connectionsLoading } = useQuery({
    queryKey: ["connections", agentId],
    queryFn: () => listAgentConnections(agentId),
  });

  const appId = pipedreamAppForLlmProvider(provider);
  const models = modelsForProvider(provider);
  const resolvedModelId =
    models.some((m) => m.id === modelId) ? modelId : (models[0]?.id ?? modelId);

  const connection = useMemo(() => {
    const list = connectionPayload?.connections ?? [];
    const aliases = new Set(
      [appId, provider, ...(provider === "mistral" ? ["mistral_ai", "mistral"] : [])].map((s) =>
        s.toLowerCase(),
      ),
    );
    return list.find((c) => {
      const status = String(c.status || "").toLowerCase();
      if (!["active", "connected", "ok"].includes(status)) return false;
      return aliases.has(String(c.app_id || "").toLowerCase());
    });
  }, [connectionPayload, appId, provider]);

  const connectStatus = connection
    ? "connected"
    : connectionsLoading
      ? "needs_setup"
      : "disconnected";

  const finish = async () => {
    try {
      if (runId) {
        await submitBuilderSecret({
          runId,
          provider,
          modelId: resolvedModelId || undefined,
        });
      } else if (provider && resolvedModelId) {
        await updateAgentModel({ agentId, provider, modelId: resolvedModelId });
      }
      setCompleted(true);
      onSubmitted?.();
      void queryClient.invalidateQueries({ queryKey: ["builder"] });
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
      void queryClient.invalidateQueries({ queryKey: ["connections", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
    } catch (err) {
      setErrorKey(agentServiceErrorKey(err));
      setCompleted(false);
    }
  };

  if (completed) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("builder:secrets.pipedreamNotice")}
      </p>

      <div className="space-y-1.5">
        <Label>{t("builder:secrets.provider")}</Label>
        <DaSelect
          value={provider}
          onChange={(v) => {
            const next = normalizeLiveProvider(v);
            setProvider(next);
            const nextModels = modelsForProvider(next);
            setModelId(nextModels[0]?.id ?? "");
          }}
          options={LIVE_LLM_PROVIDERS.map((p) => ({
            value: p,
            label: t(`builder:secrets.providers.${p}`, { defaultValue: p }),
          }))}
        />
      </div>

      {models.length > 0 ? (
        <div className="space-y-1.5">
          <Label>{t("structure:panel.model")}</Label>
          <DaSelect
            value={resolvedModelId}
            onChange={setModelId}
            options={models.map((m) => ({ value: m.id, label: m.label }))}
          />
          <p className="text-xs text-muted-foreground">{t("structure:panel.modelChoiceHint")}</p>
        </div>
      ) : null}

      <IntegrationConnectionCard
        provider="pipedream"
        appId={appId}
        agentId={agentId}
        status={connectStatus}
        accountEmail={connection?.account_email}
        connectionId={connection?.id}
        onConnected={() => {
          void finish();
        }}
        onChanged={() => {
          void queryClient.invalidateQueries({ queryKey: ["connections", agentId] });
        }}
      />

      {errorKey ? <p className="text-sm text-destructive">{t(errorKey)}</p> : null}
    </div>
  );
}
