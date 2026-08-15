"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Hammer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { RequireAuth } from "@/components/auth/require-auth";
import { SettingsDialog } from "@/components/builder/settings-dialog";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { listMyAgentsAction, type MyAgentCard } from "@/lib/actions/public-agents";
import { cn } from "@/lib/utils";

type TabId = "created" | "using" | "favorites";

function AgentCard({ card }: { card: MyAgentCard }) {
  const { t } = useTranslation(["common", "builder"]);
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{card.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {card.creatorUsername ? `@${card.creatorUsername}` : "—"}
          {" · "}
          {card.status}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {card.isOwner ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5 rounded-full">
            <Link href={`/agents/${card.agentId}/build`}>
              <Hammer className="size-3.5" aria-hidden="true" />
              {t("common:myAgents.openBuilder")}
            </Link>
          </Button>
        ) : null}
        {card.publicPath ? (
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link href={card.publicPath}>
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t("common:actions.openAgent")}
            </Link>
          </Button>
        ) : card.isOwner ? (
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link href={`/agents/${card.agentId}/agent`}>
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t("common:actions.openAgent")}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MyAgentsContent() {
  const { t } = useTranslation(["common"]);
  const [tab, setTab] = useState<TabId>("created");
  const query = useQuery({
    queryKey: ["my-agents"],
    queryFn: () => listMyAgentsAction(),
  });

  const cards = useMemo(() => {
    if (!query.data) return [];
    if (tab === "created") return query.data.created;
    if (tab === "using") return query.data.using;
    return query.data.favorites;
  }, [query.data, tab]);

  const tabs: { id: TabId; label: string; count: number }[] = [
    {
      id: "created",
      label: t("common:myAgents.tabs.created"),
      count: query.data?.created.length ?? 0,
    },
    {
      id: "using",
      label: t("common:myAgents.tabs.using"),
      count: query.data?.using.length ?? 0,
    },
    {
      id: "favorites",
      label: t("common:myAgents.tabs.favorites"),
      count: query.data?.favorites.length ?? 0,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("common:myAgents.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("common:myAgents.subtitle")}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href="/agents">{t("common:actions.back")}</Link>
        </Button>
      </div>

      <div className="glass mb-6 flex flex-wrap gap-1 rounded-full p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              tab === item.id
                ? "bg-foreground/[0.08] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            <span className="ml-1.5 text-xs opacity-70">{item.count}</span>
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-16">
          <BrandLoader label={t("common:loading")} />
        </div>
      ) : cards.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("common:myAgents.empty")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <AgentCard key={`${tab}-${card.agentId}`} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyAgentsPage() {
  return (
    <RequireAuth>
      <div className="relative min-h-svh">
        <AnimatedBackground variant="soft" />
        <MyAgentsContent />
        <SettingsDialog />
      </div>
    </RequireAuth>
  );
}
