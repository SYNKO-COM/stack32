"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { decideLiveApproval } from "@/lib/actions/live";
import type { BuilderUiComponent } from "@/lib/domain/types";

function fieldValue(fields: BuilderUiComponent["fields"], key: string): string {
  return fields.find((f) => f.key === key)?.suggested_value ?? "";
}

export function LiveApprovalCard({
  agentId,
  uiComponent,
  onDecided,
}: {
  agentId: string;
  uiComponent: BuilderUiComponent;
  onDecided?: () => void;
}) {
  const { t } = useTranslation(["live", "builder", "common"]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [done, setDone] = useState<"approved" | "denied" | null>(null);

  const approvalId = fieldValue(uiComponent.fields, "approval_id");
  const runId = fieldValue(uiComponent.fields, "run_id");
  const toolId = fieldValue(uiComponent.fields, "tool_id");
  const actionSummary =
    fieldValue(uiComponent.fields, "action_summary") ||
    t("live:approval.defaultAction", { defaultValue: "Allow this action to continue." });

  if (!approvalId) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        {t("live:approval.missing", {
          defaultValue: "Approval details are missing. Try sending your request again.",
        })}
      </p>
    );
  }

  if (done) {
    return (
      <p className="mt-3 rounded-xl border border-border/60 bg-foreground/[0.03] px-3 py-2 text-sm text-muted-foreground">
        {done === "approved"
          ? t("live:approval.approved", { defaultValue: "Approved — continuing…" })
          : t("live:approval.denied", { defaultValue: "Denied — the agent will not run this action." })}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
      <div className="flex gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
            {t("live:approval.title", { defaultValue: "Approval required" })}
          </p>
          <p className="text-sm text-amber-900/90 dark:text-amber-100/90">{actionSummary}</p>
          {toolId ? (
            <p className="font-mono text-[11px] text-amber-800/70 dark:text-amber-200/70">{toolId}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="rounded-xl"
          disabled={pending}
          onClick={() => {
            setError(false);
            startTransition(async () => {
              try {
                await decideLiveApproval({
                  agentId,
                  approvalId,
                  runId: runId || undefined,
                  decision: "approved",
                });
                setDone("approved");
                onDecided?.();
              } catch {
                setError(true);
              }
            });
          }}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          {t("live:approval.approve", { defaultValue: "Approve" })}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={pending}
          onClick={() => {
            setError(false);
            startTransition(async () => {
              try {
                await decideLiveApproval({
                  agentId,
                  approvalId,
                  runId: runId || undefined,
                  decision: "denied",
                });
                setDone("denied");
                onDecided?.();
              } catch {
                setError(true);
              }
            });
          }}
        >
          {t("live:approval.deny", { defaultValue: "Deny" })}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive">
          {t("live:approval.error", { defaultValue: "Could not save your decision. Try again." })}
        </p>
      ) : null}
    </div>
  );
}
