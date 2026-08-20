"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { useAgents, useCreateAgent } from "@/hooks/use-agents";
import { useActiveWorkspace } from "@/hooks/use-workspaces";
import { useTranslation } from "@/hooks/use-translation";
import { isPlanLimitError } from "@/lib/billing/plan-limit";
import { getPendingPrompt } from "@/lib/pending-prompt";
import { useUiStore } from "@/store/ui-store";

/**
 * /agents entry point:
 * - a pending landing prompt creates a fresh agent and opens Build;
 * - if agents exist, redirects to the most recent;
 * - if none exist, shows an empty state (create CTA) instead of auto-creating.
 */
export default function AgentsIndexPage() {
  const { t } = useTranslation(["common", "errors"]);
  const router = useRouter();
  const openDialog = useUiStore((s) => s.openDialog);
  const { activeWorkspaceId } = useActiveWorkspace();
  const { data: agents, isLoading } = useAgents(activeWorkspaceId);
  const createAgent = useCreateAgent();
  const handledRef = useRef(false);
  const [creating, startCreate] = useTransition();

  useEffect(() => {
    if (isLoading || handledRef.current || !agents || !activeWorkspaceId) return;

    const pending = getPendingPrompt();
    if (pending || agents.length > 0) {
      handledRef.current = true;
      const go = async () => {
        try {
          if (pending || agents.length === 0) {
            const agent = await createAgent.mutateAsync({ workspaceId: activeWorkspaceId });
            router.replace(`/agents/${agent.id}/build`);
            return;
          }
          router.replace(`/agents/${agents[0].id}/build`);
        } catch (error) {
          handledRef.current = false;
          if (isPlanLimitError(error)) openDialog("upgrade");
        }
      };
      void go();
    }
  }, [agents, isLoading, createAgent, router, activeWorkspaceId, openDialog]);

  if (isLoading || !agents || !activeWorkspaceId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <BrandLoader label={t("common:loading")} size="lg" />
      </div>
    );
  }

  if (agents.length === 0 && !getPendingPrompt()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("errors:noAgentsYet.title")}</h1>
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
    <div className="flex flex-1 items-center justify-center">
      <BrandLoader label={t("common:loading")} size="lg" />
    </div>
  );
}
