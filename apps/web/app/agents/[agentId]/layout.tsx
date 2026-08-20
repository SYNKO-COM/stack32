"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";

import { Topbar } from "@/components/builder/topbar";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { useAgent, useAgents, useCreateAgent } from "@/hooks/use-agents";
import { useActiveWorkspace } from "@/hooks/use-workspaces";
import { useTranslation } from "@/hooks/use-translation";
import { isPlanLimitError } from "@/lib/billing/plan-limit";
import { useUiStore } from "@/store/ui-store";

export default function AgentWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ agentId: string }>();
  const router = useRouter();
  const { t } = useTranslation(["errors", "common"]);
  const openDialog = useUiStore((s) => s.openDialog);
  const { activeWorkspaceId, isLoading: wsLoading } = useActiveWorkspace();
  const { data: agent, isLoading } = useAgent(params.agentId);
  const { data: agents, isLoading: agentsLoading } = useAgents(activeWorkspaceId);
  const createAgent = useCreateAgent();
  const [creating, startCreate] = useTransition();

  if (isLoading || agentsLoading || wsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <BrandLoader label={t("common:loading")} size="lg" />
      </div>
    );
  }

  if (!activeWorkspaceId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("errors:noAgentsYet.title")}
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          {t("errors:noAgentsYet.subtitle")}
        </p>
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
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            {t("errors:noAgentsYet.subtitle")}
          </p>
          <Button
            className="mt-8 rounded-full"
            disabled={creating || createAgent.isPending}
            onClick={() => {
              startCreate(async () => {
                try {
                  const created = await createAgent.mutateAsync({
                    workspaceId: activeWorkspaceId,
                  });
                  router.replace(`/agents/${created.id}/build`);
                } catch (error) {
                  if (isPlanLimitError(error)) openDialog("upgrade");
                }
              });
            }}
          >
            {t("errors:noAgentsYet.cta")}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("errors:agentNotFound.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("errors:agentNotFound.subtitle")}</p>
        <Button asChild className="mt-8 rounded-full">
          <Link href={`/agents/${agents[0].id}/build`}>{t("errors:agentNotFound.cta")}</Link>
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
