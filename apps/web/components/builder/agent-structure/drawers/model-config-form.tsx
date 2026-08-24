"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { Button } from "@/components/ui/button";
import { DaSelect } from "@/components/ui/da-select";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import {
  LIVE_LLM_PROVIDERS,
  modelsForProvider,
  pipedreamAppForLlmProvider,
  type LiveLlmProviderId,
} from "@/lib/ai/llm-catalog";
import { agentServiceErrorKey } from "@/lib/ai/agent-service-errors";
import { updateAgentModel } from "@/lib/actions/builder";
import { listAgentConnections } from "@/lib/actions/connections";
import type { ProductNode } from "@/lib/domain/product-agent-graph";

function normalizeLiveProvider(raw: string | undefined): LiveLlmProviderId {
  const value = (raw || "openai").toLowerCase();
  return (LIVE_LLM_PROVIDERS as readonly string[]).includes(value)
    ? (value as LiveLlmProviderId)
    : "openai";
}

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
  const { data: connectionPayload } = useQuery({
    queryKey: ["connections", agentId],
    queryFn: () => listAgentConnections(agentId),
  });
  //: Until the first answer lands there is nothing to report. Saying
  //: "not connected" in the meantime told people their account had dropped
  //: every time they reloaded the page.
  const connectionsKnown = connectionPayload !== undefined;
  const current = node.subtitle?.split(" · ") ?? [];
  const [provider, setProvider] = useState<LiveLlmProviderId>(() =>
    normalizeLiveProvider(current[0]),
  );
  const [modelId, setModelId] = useState(() => current[1] ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const models = useMemo(() => modelsForProvider(provider), [provider]);
  const resolvedModelId = models.some((m) => m.id === modelId)
    ? modelId
    : (models[0]?.id ?? "");
  const appId = pipedreamAppForLlmProvider(provider);

  const connection = useMemo(() => {
    const list = connectionPayload?.connections ?? [];
    const aliases = new Set(
      [
        appId,
        provider,
        ...(provider === "xai" ? ["x_ai", "xai"] : []),
        ...(provider === "mistral" ? ["mistral_ai", "mistral"] : []),
      ].map((s) => s.toLowerCase()),
    );
    return list.find((c) => {
      const status = String(c.status || "").toLowerCase();
      if (!["active", "connected", "ok"].includes(status)) return false;
      const metaApp = String(c.app_id || "").toLowerCase();
      return aliases.has(metaApp);
    });
  }, [connectionPayload, appId, provider]);

  const connected = Boolean(connection);
  const connectStatus = connected
    ? "connected"
    : connectionsKnown
      ? "disconnected"
      : "checking";

  const handleProviderChange = (next: string) => {
    const normalized = normalizeLiveProvider(next);
    setProvider(normalized);
    const nextModels = modelsForProvider(normalized);
    setModelId(nextModels[0]?.id ?? "");
    setSaved(false);
  };

  const persistModel = async () => {
    if (!provider || !resolvedModelId) {
      setErrorKey("errors:form.required");
      return;
    }
    setSubmitting(true);
    setErrorKey(null);
    setSaved(false);
    try {
      await updateAgentModel({ agentId, provider, modelId: resolvedModelId });
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["agents", agentId] });
      await queryClient.invalidateQueries({ queryKey: ["agents", agentId, "spec"] });
      await queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
      await queryClient.invalidateQueries({ queryKey: ["connections", agentId] });
      onSaved?.();
    } catch (err) {
      setErrorKey(agentServiceErrorKey(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("structure:panel.modelSubtitle")}</p>

      <div className="space-y-1.5">
        <Label htmlFor="structure-model-provider">{t("structure:panel.provider")}</Label>
        <DaSelect
          id="structure-model-provider"
          value={provider}
          disabled={submitting}
          onChange={handleProviderChange}
          options={LIVE_LLM_PROVIDERS.map((option) => ({
            value: option,
            label: t(`builder:secrets.providers.${option}`, { defaultValue: option }),
          }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="structure-model-id">{t("structure:panel.model")}</Label>
        <DaSelect
          id="structure-model-id"
          value={resolvedModelId}
          disabled={submitting || models.length === 0}
          onChange={(value) => {
            setModelId(value);
            setSaved(false);
          }}
          options={models.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
        />
        <p className="text-xs text-muted-foreground">{t("structure:panel.modelChoiceHint")}</p>
      </div>

      <div className="space-y-2">
        <Label>{t("structure:panel.connectProvider")}</Label>
        <p className="text-xs text-muted-foreground">{t("structure:panel.connectHint")}</p>
        <IntegrationConnectionCard
          provider="pipedream"
          appId={appId}
          agentId={agentId}
          status={connectStatus}
          accountEmail={connection?.account_email}
          connectionId={connection?.id}
          onConnected={() => {
            void persistModel();
          }}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["connections", agentId] });
            void queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
          }}
        />
      </div>

      {errorKey ? (
        <p className="text-sm text-destructive">{t(errorKey)}</p>
      ) : saved ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("structure:panel.saved")}</p>
      ) : null}

      <Button
        type="button"
        className="w-full rounded-xl"
        disabled={submitting || !resolvedModelId}
        onClick={() => void persistModel()}
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("structure:panel.saving")}
          </>
        ) : (
          t("structure:panel.save")
        )}
      </Button>
    </div>
  );
}
