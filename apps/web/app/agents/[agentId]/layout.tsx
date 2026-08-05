"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Topbar } from "@/components/builder/topbar";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { useAgent, useAgents, useCreateAgent } from "@/hooks/use-agents";
import { useTranslation } from "@/hooks/use-translation";

export default function AgentWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ agentId: string }>();
  const router = useRouter();
  const { t } = useTranslation(["errors", "common"]);
  const { data: agent, isLoading } = useAgent(params.agentId);
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const createAgent = useCreateAgent();
  const [creating, setCreating] = useState(false);

  if (isLoading || agentsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <BrandLoader label={t("common:loading")} size="lg" />
      </div>
    );
  }

  if (!agent) {
    const noAgentsYet = !agents || agents.length === 0;

    if (noAgentsYet) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("errors:noAgentsYet.title")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("errors:noAgentsYet.subtitle")}
          </p>
          <Button
            className="mt-8 rounded-full"
            disabled={creating || createAgent.isPending}
            onClick={() => {
              if (creating || createAgent.isPending) return;
              setCreating(true);
              void createAgent
                .mutateAsync(undefined)
                .then((created) => {
                  router.replace(`/agents/${created.id}/build`);
                })
                .finally(() => setCreating(false));
            }}
          >
            {creating || createAgent.isPending
              ? t("common:loading")
              : t("errors:noAgentsYet.cta")}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("errors:agentNotFound.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("errors:agentNotFound.subtitle")}</p>
        <Button asChild className="mt-8 rounded-full">
          <Link href="/agents">{t("errors:agentNotFound.cta")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <Topbar agentId={params.agentId} />
      <div className="min-h-0 flex-1">{children}</div>
    </>
  );
}
