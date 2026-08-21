"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { WorkspaceChrome } from "@/components/builder/workspace-chrome";
import { ReviewCarousel } from "@/components/marketplace/review-form";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { getCreatorDashboardAction } from "@/lib/actions/marketplace";
import { cn } from "@/lib/utils";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.04] px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

type DashboardTab = "general" | "agents";

export default function DashboardPage() {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<DashboardTab>("general");
  const query = useQuery({
    queryKey: ["creator-dashboard"],
    queryFn: () => getCreatorDashboardAction(),
  });

  const agents = query.data?.agents ?? [];

  const overview = useMemo(() => {
    const views = agents.reduce((sum, a) => sum + a.views, 0);
    const subscribers = agents.reduce((sum, a) => sum + a.subscribers, 0);
    const revenueCents = agents.reduce((sum, a) => sum + a.revenueCents, 0);
    const allReviews = agents.flatMap((a) => a.reviews);
    const reviewAgentName = new Map<string, string>();
    for (const agent of agents) {
      for (const review of agent.reviews) {
        reviewAgentName.set(review.id, agent.name);
      }
    }
    const ratingSum = allReviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = allReviews.length > 0 ? ratingSum / allReviews.length : null;
    return {
      views,
      subscribers,
      revenueCents,
      avgRating,
      reviewCount: allReviews.length,
      reviews: allReviews,
      reviewAgentName,
      agentCount: agents.length,
    };
  }, [agents]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceChrome title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <BrandLoader label={t("loading")} />
          </div>
        ) : agents.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("dashboard.empty")}</p>
        ) : (
          <div className="space-y-4">
            <div
              className="inline-flex rounded-full bg-foreground/[0.04] p-1"
              role="tablist"
              aria-label={t("dashboard.title")}
            >
              <Button
                type="button"
                role="tab"
                aria-selected={tab === "general"}
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-full px-4",
                  tab === "general" && "bg-background text-foreground shadow-sm",
                )}
                onClick={() => setTab("general")}
              >
                {t("dashboard.tabGeneral")}
              </Button>
              <Button
                type="button"
                role="tab"
                aria-selected={tab === "agents"}
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-full px-4",
                  tab === "agents" && "bg-background text-foreground shadow-sm",
                )}
                onClick={() => setTab("agents")}
              >
                {t("dashboard.tabAgents")}
              </Button>
            </div>

            {tab === "general" ? (
              <section className="glass space-y-4 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{t("dashboard.generalTitle")}</h2>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.agentsCount", { count: overview.agentCount })}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label={t("dashboard.views")} value={String(overview.views)} />
                  <Stat
                    label={t("dashboard.subscribers")}
                    value={String(overview.subscribers)}
                  />
                  <Stat
                    label={t("dashboard.revenue")}
                    value={`${(overview.revenueCents / 100).toFixed(2)} €`}
                  />
                  <Stat
                    label={t("dashboard.avgRating")}
                    value={overview.avgRating ? overview.avgRating.toFixed(1) : "—"}
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">{t("review.title")}</p>
                  <ReviewCarousel
                    reviews={overview.reviews}
                    agentLabel={(review) => overview.reviewAgentName.get(review.id)}
                  />
                </div>
              </section>
            ) : (
              <div className="space-y-4">
                {agents.map((agent) => (
                  <section key={agent.agentId} className="glass space-y-4 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold">{agent.name}</h2>
                      <Link
                        href={`/agents/${agent.agentId}/settings`}
                        className="text-sm text-brand hover:underline"
                      >
                        {t("actions.settings")}
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Stat label={t("dashboard.views")} value={String(agent.views)} />
                      <Stat
                        label={t("dashboard.subscribers")}
                        value={String(agent.subscribers)}
                      />
                      <Stat
                        label={t("dashboard.revenue")}
                        value={`${(agent.revenueCents / 100).toFixed(2)} €`}
                      />
                      <Stat
                        label={t("dashboard.avgRating")}
                        value={agent.avgRating ? agent.avgRating.toFixed(1) : "—"}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">{t("review.title")}</p>
                      <ReviewCarousel reviews={agent.reviews} />
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
