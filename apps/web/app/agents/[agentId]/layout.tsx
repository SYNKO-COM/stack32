"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Topbar } from "@/components/builder/topbar";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { useAgent } from "@/hooks/use-agents";
import { useTranslation } from "@/hooks/use-translation";

export default function AgentWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ agentId: string }>();
  const { t } = useTranslation(["errors", "common"]);
  const { data: agent, isLoading } = useAgent(params.agentId);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <BrandLoader label={t("common:loading")} size="lg" />
      </div>
    );
  }

  if (!agent) {
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
