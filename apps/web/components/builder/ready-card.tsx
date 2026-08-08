"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TypewriterText } from "@/components/builder/message-motion";
import { SecretForm } from "@/components/builder/secret-form";
import { Markdown } from "@/components/shared/markdown";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { listAgentSecretsMeta } from "@/lib/actions/agents";
import type {
  BuilderAction,
  BuilderSuggestion,
  BuilderUiComponent,
  IdentitySummary,
} from "@/lib/domain/types";

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
  actions,
  onFix,
  animate = false,
  onDone,
}: {
  agentId: string;
  content: string;
  identitySummary?: IdentitySummary;
  suggestions?: BuilderSuggestion[];
  actions?: BuilderAction[];
  onFix: () => void;
  onSuggestion?: (prompt: string) => void;
  animate?: boolean;
  onDone?: () => void;
}) {
  const { t } = useTranslation("builder");
  const router = useRouter();
  const [typedDone, setTypedDone] = useState(!animate);
  const [needsKey, setNeedsKey] = useState(false);
  const [checkingKey, setCheckingKey] = useState(false);
  const name = identitySummary?.name;

  const lead = name ? t("ready.titleNamed", { name }) : t("ready.title");
  const plainBody = `${lead}\n\n${content}`.replace(/\*\*/g, "");

  const finish = () => {
    setTypedDone(true);
    onDone?.();
  };

  const goLive = async () => {
    setCheckingKey(true);
    try {
      const secrets = await listAgentSecretsMeta(agentId);
      const hasLlm = secrets.some((s) => s.secret_kind === "llm_api_key");
      if (!hasLlm) {
        setNeedsKey(true);
        return;
      }
      router.push(`/agents/${agentId}/agent`);
    } catch {
      router.push(`/agents/${agentId}/agent`);
    } finally {
      setCheckingKey(false);
    }
  };

  if (animate && !typedDone) {
    return (
      <p>
        <TypewriterText text={plainBody} active onDone={finish} />
      </p>
    );
  }

  const liveGateForm: BuilderUiComponent = {
    type: "secret_form",
    version: "1",
    requestId: `ready-live-${agentId}`,
    context: "live",
    fields: [
      { key: "provider", type: "select", required: true, suggested_value: "openai" },
      { key: "api_key", type: "password", required: true },
    ],
  };

  return (
    <div className="space-y-4">
      <Markdown content={`${lead}\n\n${content}`} />

      {needsKey ? (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-sm text-muted-foreground">
            {t("ready.llmKeyRequired", {
              defaultValue: "Add your LLM API key before testing Live.",
            })}
          </p>
          <SecretForm
            uiComponent={liveGateForm}
            agentId={agentId}
            runId={liveGateForm.requestId}
            onSubmitted={() => {
              setNeedsKey(false);
              router.push(`/agents/${agentId}/agent`);
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(actions ?? ["test_agent"]).map((action) => {
          if (action === "test_agent") {
            return (
              <Button
                key={action}
                size="sm"
                className="rounded-full"
                disabled={checkingKey}
                onClick={() => void goLive()}
              >
                {t("actions.testAgent")}
                <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
              </Button>
            );
          }
          if (action === "view_structure" || action === "view_changes") {
            return null;
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
    </div>
  );
}
