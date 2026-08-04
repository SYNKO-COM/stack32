"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Topbar } from "@/components/builder/topbar";
import { Button } from "@/components/ui/button";
import { useAgent } from "@/hooks/use-agents";
import { useTranslation } from "@/hooks/use-translation";

export default function AgentWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ agentId: string }>();
  const { t } = useTranslation("errors");
  const { data: agent, isLoading } = useAgent(params.agentId);

  if (!isLoading && agent === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("agentNotFound.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("agentNotFound.subtitle")}</p>
        <Button asChild className="mt-8 rounded-full">
          <Link href="/agents">{t("agentNotFound.cta")}</Link>
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
