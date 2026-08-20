"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import {
  getAgentListingSettingsAction,
  listAccessRequestsAction,
  resolveAccessRequestAction,
  updateAgentListingAction,
  type ListingVisibility,
} from "@/lib/actions/marketplace";
import { eurosToCents } from "@/lib/marketplace/shuffle";
import { SITE_URL } from "@/lib/site";

export default function AgentSettingsPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const listing = useQuery({
    queryKey: ["agent-listing", agentId],
    queryFn: () => getAgentListingSettingsAction(agentId),
    enabled: Boolean(agentId),
  });
  const requests = useQuery({
    queryKey: ["agent-access-requests", agentId],
    queryFn: () => listAccessRequestsAction(agentId),
    enabled: Boolean(agentId),
  });

  const [visibility, setVisibility] = useState<ListingVisibility>("private");
  const [tagline, setTagline] = useState("");
  const [price, setPrice] = useState("0");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!listing.data) return;
    setVisibility(listing.data.visibility);
    setTagline(listing.data.tagline);
    setPrice((listing.data.priceCents / 100).toFixed(2));
  }, [listing.data]);

  if (listing.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <BrandLoader label={t("loading")} />
      </div>
    );
  }

  if (!listing.data) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {t("agentSettings.loadError")}
      </div>
    );
  }

  const publicUrl = listing.data.publicPath
    ? `${SITE_URL.replace(/\/$/, "")}${listing.data.publicPath}`
    : null;

  return (
    <div className="h-full overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto max-w-xl space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("agentSettings.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("agentSettings.subtitle")}</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void updateAgentListingAction({
              agentId,
              visibility,
              tagline,
              priceCents: eurosToCents(Number(price)),
            }).then(() => {
              setSaved(true);
              void queryClient.invalidateQueries({ queryKey: ["agent-listing", agentId] });
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="visibility">{t("agentSettings.visibility")}</Label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ListingVisibility)}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="public">{t("agentSettings.visibilityPublic")}</option>
              <option value="private">{t("agentSettings.visibilityPrivate")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tagline">{t("agentSettings.tagline")}</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={t("agentSettings.taglinePlaceholder")}
              maxLength={160}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price">{t("agentSettings.price")}</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <Button type="submit" className="rounded-full">
            {t("actions.save")}
          </Button>
          {saved ? <p className="text-sm text-emerald-600">{t("agentSettings.saved")}</p> : null}
        </form>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("agentSettings.publicLink")}</h2>
          {publicUrl && listing.data.publicPath ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 break-all rounded-xl bg-foreground/[0.04] px-3 py-2 font-mono text-xs">
                {publicUrl}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-full"
                onClick={() => {
                  void navigator.clipboard.writeText(publicUrl).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? t("actions.copied") : t("actions.copyLink")}
              </Button>
              <Button asChild size="sm" className="gap-1.5 rounded-full">
                <Link href={listing.data.publicPath}>
                  <ExternalLink className="size-3.5" />
                  {t("actions.openAgent")}
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("agentSettings.notPublished")}</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("agentSettings.accessRequests")}</h2>
          {requests.data && requests.data.length > 0 ? (
            <ul className="space-y-2">
              {requests.data.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-foreground/[0.04] px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{row.requesterName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`agentSettings.status.${row.status}`)}
                    </p>
                  </div>
                  {row.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          void resolveAccessRequestAction({
                            requestId: row.id,
                            status: "approved",
                          }).then(() =>
                            queryClient.invalidateQueries({
                              queryKey: ["agent-access-requests", agentId],
                            }),
                          );
                        }}
                      >
                        {t("agentSettings.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => {
                          void resolveAccessRequestAction({
                            requestId: row.id,
                            status: "denied",
                          }).then(() =>
                            queryClient.invalidateQueries({
                              queryKey: ["agent-access-requests", agentId],
                            }),
                          );
                        }}
                      >
                        {t("agentSettings.deny")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("agentSettings.noRequests")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
