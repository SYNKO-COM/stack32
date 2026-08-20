"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useTransition } from "react";

import { IntegrationConnectionCard } from "@/components/builder/integration-connection-card";
import { Button } from "@/components/ui/button";
import { DaSelect } from "@/components/ui/da-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateAgentMemorySettings } from "@/lib/actions/builder";
import { listAgentConnections } from "@/lib/actions/connections";
import { EXTERNAL_MEMORY_DATABASE_APPS } from "@/lib/ai/external-memory-apps";
import type { AgentSpec } from "@/lib/domain/types";
import { useTranslation } from "@/hooks/use-translation";

type MemoryProvider = "stack32" | "external_postgres";
type WritePolicy = "never" | "explicit" | "automatic";

/** Stable key so the parent remounts this form when server memory changes. */
export function memoryFormResetKey(memory: AgentSpec["memory"] | undefined): string {
  return [
    memory?.conversationEnabled !== false ? "1" : "0",
    memory?.semanticEnabled ? "1" : "0",
    memory?.provider ?? "stack32",
    memory?.writePolicy ?? "explicit",
    String(memory?.conversationWindow ?? 12),
    memory?.externalAppId ?? "",
    memory?.externalInstructions ?? "",
  ].join(":");
}

export function MemoryConfigForm({
  agentId,
  memory,
  onSaved,
}: {
  agentId: string;
  memory: AgentSpec["memory"] | undefined;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("structure");
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const [conversationEnabled, setConversationEnabled] = useState(
    memory?.conversationEnabled !== false,
  );
  const [semanticEnabled, setSemanticEnabled] = useState(Boolean(memory?.semanticEnabled));
  const [provider, setProvider] = useState<MemoryProvider>(memory?.provider ?? "stack32");
  const [writePolicy, setWritePolicy] = useState<WritePolicy>(
    memory?.writePolicy ?? "explicit",
  );
  const [windowSize, setWindowSize] = useState(memory?.conversationWindow ?? 12);
  const [externalAppId, setExternalAppId] = useState(
    () => memory?.externalAppId || EXTERNAL_MEMORY_DATABASE_APPS[0].id,
  );
  const [externalInstructions, setExternalInstructions] = useState(
    () => memory?.externalInstructions ?? "",
  );

  const { data: connectionPayload, isFetching: connectionsLoading } = useQuery({
    queryKey: ["connections", agentId],
    queryFn: () => listAgentConnections(agentId),
    enabled: provider === "external_postgres",
  });

  const connection = useMemo(() => {
    if (provider !== "external_postgres") return undefined;
    const list = connectionPayload?.connections ?? [];
    const aliases = new Set([externalAppId, externalAppId.replace(/_/g, "-")].map((s) =>
      s.toLowerCase(),
    ));
    return list.find((c) => {
      const status = String(c.status || "").toLowerCase();
      if (!["active", "connected", "ok"].includes(status)) return false;
      return aliases.has(String(c.app_id || "").toLowerCase());
    });
  }, [connectionPayload, externalAppId, provider]);

  const connectStatus = connection
    ? "connected"
    : connectionsLoading
      ? "needs_setup"
      : "disconnected";

  const persist = () => {
    setError(false);
    setSaved(false);
    startTransition(async () => {
      try {
        if (provider === "external_postgres") {
          await updateAgentMemorySettings({
            agentId,
            provider: "external_postgres",
            conversationEnabled: false,
            semanticEnabled: false,
            writePolicy: "never",
            conversationWindow: windowSize,
            externalAppId,
            externalInstructions: externalInstructions.trim() || undefined,
          });
        } else {
          await updateAgentMemorySettings({
            agentId,
            provider: "stack32",
            conversationEnabled,
            semanticEnabled,
            writePolicy,
            conversationWindow: windowSize,
            externalAppId: null,
            externalInstructions: null,
          });
        }
        setSaved(true);
        await queryClient.invalidateQueries({ queryKey: ["agents", agentId, "spec"] });
        await queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
        await queryClient.invalidateQueries({ queryKey: ["connections", agentId] });
        onSaved?.();
      } catch {
        setError(true);
      }
    });
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("panel.memoryIntro")}</p>

      <div className="space-y-3 rounded-2xl border border-border/60 p-4">
        <p className="text-sm font-medium">{t("panel.memoryProvider")}</p>
        <div className="space-y-2">
          {(
            [
              ["stack32", "panel.memoryProviderStack32", "panel.memoryProviderStack32Hint"],
              [
                "external_postgres",
                "panel.memoryProviderExternal",
                "panel.memoryProviderExternalHint",
              ],
            ] as const
          ).map(([value, labelKey, hintKey]) => (
            <label
              key={value}
              className="flex cursor-pointer gap-3 rounded-xl border border-border/50 px-3 py-2.5 has-[:checked]:border-brand/40 has-[:checked]:bg-brand/[0.04]"
            >
              <input
                type="radio"
                name="memory-provider"
                className="mt-1"
                checked={provider === value}
                onChange={() => {
                  setProvider(value);
                  setSaved(false);
                }}
                disabled={pending}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(labelKey)}</span>
                <span className="block text-xs text-muted-foreground">{t(hintKey)}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {provider === "stack32" ? (
        <div className="space-y-3 rounded-2xl border border-border/60 p-4">
          <p className="text-sm font-medium">{t("panel.memoryWhat")}</p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={conversationEnabled}
              onChange={(e) => {
                setConversationEnabled(e.target.checked);
                setSaved(false);
              }}
              disabled={pending}
            />
            <span>
              <span className="font-medium">{t("panel.memoryConversation")}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t("panel.memoryConversationHint")}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={semanticEnabled}
              onChange={(e) => {
                setSemanticEnabled(e.target.checked);
                setSaved(false);
              }}
              disabled={pending}
            />
            <span>
              <span className="font-medium">{t("panel.memorySemantic")}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t("panel.memorySemanticHint")}
              </span>
            </span>
          </label>

          <div className="space-y-1.5 pt-1">
            <Label>{t("panel.memoryWindow")}</Label>
            <DaSelect
              value={String(windowSize)}
              disabled={pending || !conversationEnabled}
              onChange={(value) => {
                setWindowSize(Number(value));
                setSaved(false);
              }}
              options={[6, 12, 20, 40].map((n) => ({
                value: String(n),
                label: t("values.conversationWindow", { count: n }),
              }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("panel.memoryWritePolicy")}</Label>
            <DaSelect
              value={writePolicy}
              disabled={pending}
              onChange={(value) => {
                setWritePolicy(value as WritePolicy);
                setSaved(false);
              }}
              options={[
                { value: "never", label: t("panel.memoryWriteNever") },
                { value: "explicit", label: t("panel.memoryWriteExplicit") },
                { value: "automatic", label: t("panel.memoryWriteAutomatic") },
              ]}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-border/60 p-4">
          <div className="space-y-1.5">
            <Label>{t("panel.memoryExternalApp")}</Label>
            <p className="text-xs text-muted-foreground">{t("panel.memoryExternalAppHint")}</p>
            <DaSelect
              value={externalAppId}
              disabled={pending}
              onChange={(value) => {
                setExternalAppId(value);
                setSaved(false);
              }}
              options={EXTERNAL_MEMORY_DATABASE_APPS.map((app) => ({
                value: app.id,
                label: app.label,
              }))}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("panel.memoryExternalConnect")}</Label>
            <p className="text-xs text-muted-foreground">{t("panel.memoryExternalConnectHint")}</p>
            <IntegrationConnectionCard
              provider="pipedream"
              appId={externalAppId}
              agentId={agentId}
              status={connectStatus}
              accountEmail={connection?.account_email}
              connectionId={connection?.id}
              onConnected={() => {
                setSaved(false);
                void queryClient.invalidateQueries({ queryKey: ["connections", agentId] });
                void persist();
              }}
              onChanged={() => {
                void queryClient.invalidateQueries({ queryKey: ["connections", agentId] });
                void queryClient.invalidateQueries({ queryKey: ["agent-readiness", agentId] });
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="memory-external-instructions">
              {t("panel.memoryExternalInstructions")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("panel.memoryExternalInstructionsHint")}
            </p>
            <Textarea
              id="memory-external-instructions"
              value={externalInstructions}
              disabled={pending}
              rows={4}
              className="rounded-xl"
              placeholder={t("panel.memoryExternalInstructionsPlaceholder")}
              onChange={(e) => {
                setExternalInstructions(e.target.value);
                setSaved(false);
              }}
            />
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive">{t("panel.memorySaveError")}</p>
      ) : saved ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("panel.saved")}</p>
      ) : null}

      <Button type="button" className="w-full rounded-xl" disabled={pending} onClick={persist}>
        {pending ? t("panel.saving") : t("panel.save")}
      </Button>
    </div>
  );
}
