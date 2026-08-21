"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Hammer, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { WorkspaceChrome } from "@/components/builder/workspace-chrome";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import { listMarketplaceAgentsAction } from "@/lib/actions/marketplace";
import { listMyAgentsAction, type MyAgentCard } from "@/lib/actions/public-agents";
import { cn } from "@/lib/utils";

type TabId = "created" | "using" | "favorites" | "marketplace";

function AgentCard({
  card,
}: {
  card: MyAgentCard & {
    tagline?: string;
    priceCents?: number;
    publicPath?: string;
    avgRating?: number;
    reviewCount?: number;
  };
}) {
  const { t } = useTranslation(["common"]);
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{card.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {card.creatorUsername ? `@${card.creatorUsername}` : "—"}
          {card.status ? ` · ${card.status}` : ""}
        </p>
        {card.tagline ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{card.tagline}</p>
        ) : null}
        {typeof card.reviewCount === "number" && card.reviewCount > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            ★ {card.avgRating?.toFixed(1)} · {card.reviewCount} {t("common:myAgents.reviews")}
          </p>
        ) : null}
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

export default function LibraryPage() {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<TabId>("created");
  const [query, setQuery] = useState("");
  const mine = useQuery({
    queryKey: ["my-agents"],
    queryFn: () => listMyAgentsAction(),
  });
  const market = useQuery({
    queryKey: ["marketplace-agents"],
    queryFn: () => listMarketplaceAgentsAction(),
    enabled: tab === "marketplace",
  });

  const cards = useMemo(() => {
    if (tab === "marketplace") {
      const list = market.data ?? [];
      const q = query.trim().toLowerCase();
      return list.filter((item) => {
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          item.creatorUsername.toLowerCase().includes(q) ||
          (item.tagline ?? "").toLowerCase().includes(q)
        );
      });
    }
    if (!mine.data) return [];
    if (tab === "created") return mine.data.created;
    if (tab === "using") return mine.data.using;
    return mine.data.favorites;
  }, [mine.data, market.data, tab, query]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "created", label: t("myAgents.tabs.created") },
    { id: "using", label: t("myAgents.tabs.using") },
    { id: "favorites", label: t("myAgents.tabs.favorites") },
    { id: "marketplace", label: t("myAgents.tabs.marketplace") },
  ];

  const loading = tab === "marketplace" ? market.isLoading : mine.isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceChrome title={t("myAgents.title")} subtitle={t("myAgents.subtitle")} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="glass mb-4 inline-flex w-fit max-w-full flex-wrap gap-1 rounded-full p-1">
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
            </button>
          ))}
        </div>

        {tab === "marketplace" ? (
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("myAgents.searchPlaceholder")}
              className="rounded-full pl-9"
            />
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-16">
            <BrandLoader label={t("loading")} />
          </div>
        ) : cards.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {tab === "marketplace" ? t("myAgents.marketplaceEmpty") : t("myAgents.empty")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tab === "marketplace"
              ? (cards as Awaited<ReturnType<typeof listMarketplaceAgentsAction>>).map((card) => (
                  <AgentCard
                    key={card.agentId}
                    card={{
                      agentId: card.agentId,
                      name: card.name,
                      status: card.priceCents > 0 ? `${(card.priceCents / 100).toFixed(2)} €` : t("myAgents.priceFree"),
                      creatorUsername: card.creatorUsername,
                      isOwner: false,
                      publicPath: card.publicPath,
                      tagline: card.tagline,
                      avgRating: card.avgRating,
                      reviewCount: card.reviewCount,
                    }}
                  />
                ))
              : (cards as MyAgentCard[]).map((card) => (
                  <AgentCard key={`${tab}-${card.agentId}`} card={card} />
                ))}
          </div>
        )}
      </div>
    </div>
  );
}
