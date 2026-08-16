"use client";

import { useState, useTransition } from "react";

import { updateAgentMemorySettings } from "@/lib/actions/builder";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import type { AgentSpec } from "@/lib/domain/types";

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

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(false);
        setSaved(false);
        startTransition(async () => {
          try {
            await updateAgentMemorySettings({
              agentId,
              conversationEnabled,
              semanticEnabled,
              provider,
              writePolicy,
              conversationWindow: windowSize,
            });
            setSaved(true);
            onSaved?.();
          } catch {
            setError(true);
          }
        });
      }}
    >
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
        {provider === "external_postgres" ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            {t("panel.memoryExternalSoon")}
          </p>
        ) : null}
      </div>

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
          <Label htmlFor="memory-window">{t("panel.memoryWindow")}</Label>
          <select
            id="memory-window"
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            value={windowSize}
            disabled={pending || !conversationEnabled}
            onChange={(e) => {
              setWindowSize(Number(e.target.value));
              setSaved(false);
            }}
          >
            {[6, 12, 20, 40].map((n) => (
              <option key={n} value={n}>
                {t("values.conversationWindow", { count: n })}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="memory-write">{t("panel.memoryWritePolicy")}</Label>
          <select
            id="memory-write"
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            value={writePolicy}
            disabled={pending}
            onChange={(e) => {
              setWritePolicy(e.target.value as WritePolicy);
              setSaved(false);
            }}
          >
            <option value="never">{t("panel.memoryWriteNever")}</option>
            <option value="explicit">{t("panel.memoryWriteExplicit")}</option>
            <option value="automatic">{t("panel.memoryWriteAutomatic")}</option>
          </select>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{t("panel.memorySaveError")}</p>
      ) : saved ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("panel.saved")}</p>
      ) : null}

      <Button type="submit" className="w-full rounded-xl" disabled={pending}>
        {pending ? t("panel.saving") : t("panel.save")}
      </Button>
    </form>
  );
}
