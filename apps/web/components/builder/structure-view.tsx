"use client";

import {
  BookOpen,
  Brain,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock3,
  FileOutput,
  GitBranch,
  Hammer,
  ListChecks,
  MessageSquareText,
  ScrollText,
  Sparkles,
  Target,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConnectGoogleCard } from "@/components/builder/connect-google-card";
import { ProjectStructurePanel } from "@/components/builder/project-structure-panel";
import { StructureGraph } from "@/components/builder/structure-graph";
import { Button } from "@/components/ui/button";
import {
  useAgentGraph,
  useAgentProjectStructure,
  useAgentSpec,
  useAgentVersion,
} from "@/hooks/use-agents";
import { useTranslation } from "@/hooks/use-translation";
import { setPrefillDraft } from "@/lib/pending-prompt";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
  defaultOpen?: boolean;
}

function SectionCard({ icon: Icon, title, children, action, defaultOpen = true }: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="glass rounded-3xl">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12 text-brand">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <h2 className="flex-1 font-medium">{title}</h2>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="border-t border-border px-5 py-4">
          {children}
          {action ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 gap-1.5 px-0 text-brand hover:bg-transparent hover:text-brand-from"
              onClick={action.onClick}
            >
              <Hammer className="size-3.5" aria-hidden="true" />
              {action.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function StructureView({ agentId }: { agentId: string }) {
  const { t, i18n } = useTranslation("structure");
  const router = useRouter();
  const { data: spec, isLoading } = useAgentSpec(agentId);
  const { data: version } = useAgentVersion(agentId);
  const { data: graphData } = useAgentGraph(agentId);
  const { data: projectStructureData } = useAgentProjectStructure(agentId);

  const graph = graphData?.graph ?? spec?.graph ?? null;
  const projectStructure = projectStructureData?.structure ?? null;
  const snapshotId = projectStructureData?.snapshotId ?? null;

  const goToBuildWith = (prefillKey: string) => {
    setPrefillDraft(t(`prefill.${prefillKey}`));
    router.push(`/agents/${agentId}/build`);
  };

  if (isLoading) return null;

  if (!spec && !projectStructure) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <span className="glass mb-6 flex size-14 items-center justify-center rounded-3xl">
          <GitBranch className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("empty.title")}</h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">{t("empty.subtitle")}</p>
        <Button
          className="mt-8 rounded-full"
          onClick={() => router.push(`/agents/${agentId}/build`)}
        >
          {t("empty.cta")}
        </Button>
      </div>
    );
  }

  const muted = "text-sm text-foreground/80 leading-relaxed";
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });

  return (
    <div className="scrollbar-thin h-full min-h-0 overflow-y-auto px-4">
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        {projectStructure && snapshotId ? (
          <section className="glass rounded-3xl p-5">
            <ProjectStructurePanel
              agentId={agentId}
              structure={projectStructure}
              snapshotId={snapshotId}
            />
          </section>
        ) : graph ? (
          <StructureGraph agentId={agentId} graph={graph} />
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">{t("graph.fallback")}</p>
        )}

        <ConnectGoogleCard agentId={agentId} />

        {spec ? (
          <>
            <SectionCard
              id="goal"
              icon={Target}
              title={t("sections.goal")}
              action={{ label: t("actions.changeInBuild"), onClick: () => goToBuildWith("goal") }}
            >
              <p className={muted}>{spec.goal}</p>
            </SectionCard>

            <SectionCard
              id="instructions"
              icon={ScrollText}
              title={t("sections.instructions")}
              action={{
                label: t("actions.changeInBuild"),
                onClick: () => goToBuildWith("instructions"),
              }}
            >
              <p className={muted}>{spec.instructions}</p>
            </SectionCard>

            <SectionCard id="model" icon={Brain} title={t("sections.modelProfile")} defaultOpen={false}>
              <p className={muted}>{t(`values.model${capitalize(spec.modelProfile.profile)}`)}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t("values.temperature")} · {spec.modelProfile.temperature}
              </p>
            </SectionCard>

            <SectionCard
              id="tools"
              icon={Wrench}
              title={t("sections.tools")}
              action={{ label: t("actions.changeInBuild"), onClick: () => goToBuildWith("tools") }}
            >
              <ul className="space-y-2">
                {spec.tools.map((tool) => (
                  <li key={tool.tool} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground/85">{t(`tools.${tool.tool}`)}</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs",
                        tool.enabled
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-foreground/5 text-muted-foreground",
                      )}
                    >
                      {tool.enabled ? t("values.toolEnabled") : t("values.toolDisabled")}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard
              id="knowledge"
              icon={BookOpen}
              title={t("sections.knowledge")}
              action={{ label: t("actions.addKnowledge"), onClick: () => goToBuildWith("goal") }}
              defaultOpen={false}
            >
              <p className={muted}>
                {spec.knowledge.enabled && spec.knowledge.sourceIds.length > 0
                  ? t("values.knowledgeEnabled", { count: spec.knowledge.sourceIds.length })
                  : t("values.noKnowledge")}
              </p>
            </SectionCard>

            <SectionCard id="memory" icon={Clock3} title={t("sections.memory")} defaultOpen={false}>
              <p className={muted}>
                {t("values.conversationWindow", { count: spec.memory.conversationWindow })}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t("values.maxSteps", { count: spec.runtime.maxSteps })} ·{" "}
                {t("values.timeout", { count: spec.runtime.timeoutSeconds })}
              </p>
            </SectionCard>

            <SectionCard
              id="rules"
              icon={ListChecks}
              title={t("sections.rules")}
              action={{ label: t("actions.changeInBuild"), onClick: () => goToBuildWith("rules") }}
            >
              <ul className="list-disc space-y-1.5 pl-5">
                {spec.rules.map((rule) => (
                  <li key={rule} className={muted}>
                    {rule}
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard
              id="output"
              icon={FileOutput}
              title={t("sections.output")}
              action={{ label: t("actions.changeInBuild"), onClick: () => goToBuildWith("output") }}
              defaultOpen={false}
            >
              <p className={muted}>{t(`values.output${capitalize(spec.output.format)}`)}</p>
              {spec.output.allowTables ? (
                <p className="mt-1.5 text-sm text-muted-foreground">{t("values.tablesAllowed")}</p>
              ) : null}
            </SectionCard>

            <SectionCard
              id="starters"
              icon={MessageSquareText}
              title={t("sections.starterPrompts")}
              defaultOpen={false}
            >
              <ul className="space-y-2">
                {spec.starterPrompts.map((prompt) => (
                  <li key={prompt} className="glass rounded-xl px-3.5 py-2 text-sm text-foreground/80">
                    {prompt}
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard
              id="tests"
              icon={Sparkles}
              title={t("sections.testStatus")}
              action={{ label: t("actions.runTest"), onClick: () => goToBuildWith("test") }}
            >
              {version?.testStatus === "passed" ? (
                <p className="flex items-center gap-2 text-sm text-emerald-300">
                  <CircleCheck className="size-4" aria-hidden="true" />
                  {t("values.testPassed")}
                </p>
              ) : version?.testStatus === "failed" ? (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <CircleX className="size-4" aria-hidden="true" />
                  {t("values.testFailed")}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("values.testPending")}</p>
              )}
            </SectionCard>

            <SectionCard
              id="version"
              icon={GitBranch}
              title={t("sections.currentVersion")}
              defaultOpen={false}
            >
              {version ? (
                <>
                  <p className={muted}>{t("values.version", { number: version.versionNumber })}</p>
                  <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                    {t("values.versionCreated", {
                      date: dateFormatter.format(new Date(version.createdAt)),
                    })}
                  </p>
                </>
              ) : null}
            </SectionCard>
          </>
        ) : null}
      </div>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
