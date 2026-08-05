"use client";

import { ArrowRight, Boxes, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TypewriterText } from "@/components/builder/message-motion";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/shared/markdown";
import { useTranslation } from "@/hooks/use-translation";
import type {
  BuilderAction,
  BuilderSuggestion,
  IdentitySummary,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Structured chat reply after identity — no celebration card. */
export function IdentityConfirmedMessage({
  summary,
  animate = false,
  onDone,
}: {
  summary: IdentitySummary;
  animate?: boolean;
  onDone?: () => void;
}) {
  const { t } = useTranslation("builder");
  const [done, setDone] = useState(!animate);
  const toneLabel = summary.tone
    ? t(`identity.toneOptions.${summary.tone}`, { defaultValue: summary.tone })
    : "";

  const lead = t("identity.confirmedLead", { name: summary.name });
  const markdown = [
    lead,
    "",
    `### ${summary.name}`,
    "",
    `**${t("identity.role")}** — ${summary.role}`,
    toneLabel ? `**${t("identity.tone")}** — ${toneLabel}` : null,
    "",
    t("identity.confirmedNext"),
  ]
    .filter(Boolean)
    .join("\n");

  const finish = () => {
    setDone(true);
    onDone?.();
  };

  if (!animate) {
    return <Markdown content={markdown} />;
  }

  if (!done) {
    return (
      <p>
        <TypewriterText text={lead} active onDone={finish} />
      </p>
    );
  }

  return <Markdown content={markdown} />;
}

export function ReadyCard({
  agentId,
  content,
  identitySummary,
  suggestions,
  actions,
  onFix,
  onSuggestion,
  animate = false,
  onDone,
}: {
  agentId: string;
  content: string;
  identitySummary?: IdentitySummary;
  suggestions?: BuilderSuggestion[];
  actions?: BuilderAction[];
  onFix: () => void;
  onSuggestion: (prompt: string) => void;
  animate?: boolean;
  onDone?: () => void;
}) {
  const { t } = useTranslation("builder");
  const router = useRouter();
  const [typedDone, setTypedDone] = useState(!animate);
  const name = identitySummary?.name;

  const lead = name ? t("ready.titleNamed", { name }) : t("ready.title");
  const plainBody = `${lead}\n\n${content}`.replace(/\*\*/g, "");

  const finish = () => {
    setTypedDone(true);
    onDone?.();
  };

  if (animate && !typedDone) {
    return (
      <p>
        <TypewriterText text={plainBody} active onDone={finish} />
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Markdown content={`${lead}\n\n${content}`} />

      <div className="flex flex-wrap gap-2">
        {(actions ?? ["test_agent", "view_structure"]).map((action) => {
          if (action === "test_agent") {
            return (
              <Button
                key={action}
                size="sm"
                className="rounded-full"
                onClick={() => router.push(`/agents/${agentId}/live`)}
              >
                {t("actions.testAgent")}
                <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
              </Button>
            );
          }
          if (action === "view_structure") {
            return (
              <Button
                key={action}
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => router.push(`/agents/${agentId}/structure`)}
              >
                <Boxes className="mr-1 size-3.5" aria-hidden="true" />
                {t("actions.viewStructure")}
              </Button>
            );
          }
          return (
            <Button
              key={action}
              size="sm"
              variant="secondary"
              className="rounded-full"
              onClick={onFix}
            >
              {t("actions.fixAutomatically")}
            </Button>
          );
        })}
      </div>

      {suggestions && suggestions.length > 0 ? (
        <div className="space-y-2 border-t border-border/50 pt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("ready.improveTitle")}</p>
          <ul className="space-y-1.5">
            {suggestions.map((s) => {
              const title = t(`ready.suggestions.${s.labelKey}`, {
                defaultValue: s.labelKey,
              });
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (s.action === "test_agent") {
                        router.push(`/agents/${agentId}/live`);
                        return;
                      }
                      if (s.prompt) onSuggestion(s.prompt);
                    }}
                    className={cn(
                      "group flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left text-sm",
                      "text-foreground/85 transition-colors hover:bg-foreground/[0.04]",
                    )}
                  >
                    <Wand2
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-brand"
                      aria-hidden="true"
                    />
                    <span className="font-medium text-foreground">{title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
