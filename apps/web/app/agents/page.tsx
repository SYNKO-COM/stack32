"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { BrandLoader } from "@/components/shared/brand-loader";
import { useAgents, useCreateAgent } from "@/hooks/use-agents";
import { useTranslation } from "@/hooks/use-translation";
import { getPendingPrompt } from "@/lib/pending-prompt";

/**
 * /agents entry point:
 * - a pending landing prompt creates a fresh agent and opens its Build view;
 * - otherwise redirects to the most recent agent (or creates the first one).
 */
export default function AgentsIndexPage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { data: agents, isLoading } = useAgents();
  const createAgent = useCreateAgent();
  const handledRef = useRef(false);

  useEffect(() => {
    if (isLoading || handledRef.current || !agents) return;
    handledRef.current = true;

    const go = async () => {
      if (getPendingPrompt() || agents.length === 0) {
        const agent = await createAgent.mutateAsync(undefined);
        router.replace(`/agents/${agent.id}/build`);
        return;
      }
      router.replace(`/agents/${agents[0].id}/build`);
    };
    void go();
  }, [agents, isLoading, createAgent, router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <BrandLoader label={t("loading")} size="lg" />
    </div>
  );
}
