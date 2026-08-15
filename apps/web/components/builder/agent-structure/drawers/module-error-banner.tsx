"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import type { ExecutionErrorInfo } from "@/lib/domain/execution-state";
import { setPrefillDraft } from "@/lib/pending-prompt";

function buildTryToFixPrompt(error: ExecutionErrorInfo, agentId: string): string {
  const logs = error.fullLogText || error.logs.map((l) =>
    `#${l.sequence} ${l.eventType}${l.summary && l.summary !== "—" ? ` — ${l.summary}` : ""}`,
  ).join("\n");
  return [
    "STACK32 LIVE TOOL REPAIR REQUEST",
    "",
    "You are Stack32 Builder. Fix this Live agent tool failure with a MINIMAL, surgical change.",
    "Hard constraints:",
    "- Do NOT remove working tools unless they are clearly wrong for the goal.",
    "- Do NOT add unrelated tools or rewrite the agent from scratch.",
    "- Do NOT change the agent identity/goal unless required to fix this exact error.",
    "- Prefer fixing tool args/config/bindings, Pipedream prop mapping, connection binding,",
    "  or tool instructions — keep the existing architecture intact.",
    "- If a tool must be replaced, explain why and keep capability coverage equivalent.",
    "",
    `Agent id: ${agentId}`,
    `Failed node: ${error.nodeId || "unknown"}`,
    `Error code: ${error.code || "unknown"}`,
    `Error type: ${error.errorType || "unknown"}`,
    `User-visible message: ${error.message || "Tool failed"}`,
    "",
    "Recent run logs:",
    logs || "(no logs)",
    "",
    "Please diagnose the root cause, apply the smallest safe fix, and confirm the tool can run again.",
  ].join("\n");
}

export function ModuleErrorBanner({
  error,
  agentId,
}: {
  error: ExecutionErrorInfo;
  agentId: string;
}) {
  const { t } = useTranslation("structure");
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [fixPending, setFixPending] = useState(false);
  const preview = error.logs.slice(-4);

  return (
    <div className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/[0.07] p-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
          {t("panel.errorTitle", { defaultValue: "Error" })}
        </p>
        <p className="text-sm font-medium text-red-900 dark:text-red-100">
          {error.message || t("panel.errorFallback", { defaultValue: "Something went wrong." })}
        </p>
        {error.code || error.errorType ? (
          <p className="font-mono text-[11px] text-red-800/80 dark:text-red-200/80">
            {[error.code, error.errorType].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-red-800 dark:text-red-200">
            {t("panel.errorLogs", { defaultValue: "Recent logs" })}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 rounded-lg border-red-500/30 bg-background/60 text-xs"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(error.fullLogText || error.message || "");
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            {copied
              ? t("panel.errorCopied", { defaultValue: "Copied" })
              : t("panel.errorCopy", { defaultValue: "Copy logs" })}
          </Button>
        </div>
        <ul className="max-h-28 space-y-1 overflow-y-auto rounded-xl bg-background/50 p-2 font-mono text-[10px] leading-relaxed text-foreground/80">
          {preview.length === 0 ? (
            <li className="text-muted-foreground">
              {t("panel.errorNoLogs", { defaultValue: "No event logs for this run." })}
            </li>
          ) : (
            preview.map((line) => (
              <li key={`${line.sequence}-${line.eventType}`} className="truncate">
                <span className="text-muted-foreground">#{line.sequence}</span> {line.eventType}
                {line.summary !== "—" ? (
                  <span className="text-muted-foreground"> — {line.summary}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
        <Button
          type="button"
          size="sm"
          className="h-8 w-full gap-1.5 rounded-xl text-xs font-medium"
          disabled={fixPending}
          onClick={async () => {
            setFixPending(true);
            try {
              const prompt = buildTryToFixPrompt(error, agentId);
              try {
                await navigator.clipboard.writeText(prompt);
              } catch {
                // Clipboard may be blocked; Build prefill still works.
              }
              setPrefillDraft(prompt, { autoSend: true });
              router.push(`/agents/${agentId}/build`);
            } finally {
              setFixPending(false);
            }
          }}
        >
          <Wrench className="size-3.5" aria-hidden="true" />
          {fixPending
            ? t("panel.errorTryFixPending", { defaultValue: "Opening Build…" })
            : t("panel.errorTryFix", { defaultValue: "Try to fix" })}
        </Button>
        <p className="text-[11px] leading-snug text-red-900/70 dark:text-red-100/70">
          {t("panel.errorTryFixHint", {
            defaultValue:
              "Copies a detailed repair prompt and opens Build so Stack32 can fix this safely.",
          })}
        </p>
      </div>
    </div>
  );
}
