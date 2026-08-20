"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { WorkspaceChrome } from "@/components/builder/workspace-chrome";
import { ReviewList } from "@/components/marketplace/review-form";
import { BrandLoader } from "@/components/shared/brand-loader";
import { useTranslation } from "@/hooks/use-translation";
import { getCreatorDashboardAction } from "@/lib/actions/marketplace";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.04] px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation("common");
  const query = useQuery({
    queryKey: ["creator-dashboard"],
    queryFn: () => getCreatorDashboardAction(),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceChrome title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <BrandLoader label={t("loading")} />
          </div>
        ) : !query.data || query.data.agents.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("dashboard.empty")}</p>
        ) : (
          <div className="space-y-4">
            {query.data.agents.map((agent) => (
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
                  <Stat label={t("dashboard.subscribers")} value={String(agent.subscribers)} />
                  <Stat
                    label={t("dashboard.revenue")}
                    value={`${(agent.revenueCents / 100).toFixed(2)} €`}
                  />
                  <Stat
                    label={t("dashboard.avgRating")}
                    value={agent.avgRating ? agent.avgRating.toFixed(1) : "—"}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {t("dashboard.subscriberNames")}
                    </p>
                    <p className="text-sm">
                      {agent.subscriberNames.length > 0
                        ? agent.subscriberNames.join(", ")
                        : t("dashboard.noNames")}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {t("dashboard.buyerNames")}
                    </p>
                    <p className="text-sm">
                      {agent.buyerNames.length > 0
                        ? agent.buyerNames.join(", ")
                        : t("dashboard.noNames")}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">{t("review.title")}</p>
                  <ReviewList reviews={agent.reviews} />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
