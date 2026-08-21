"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { DaSelect } from "@/components/ui/da-select";
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
import { slugifyAgentName } from "@/lib/marketplace/slug";
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
  const [slug, setSlug] = useState("");
  const [saved, setSaved] = useState(false);
  const [slugAdjusted, setSlugAdjusted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!listing.data) return;
    setVisibility(listing.data.visibility);
    setTagline(listing.data.tagline);
    const current = listing.data.slug || "";
    const fromName = slugifyAgentName(listing.data.name);
    setSlug(
      /^untitled-agent(-[0-9]+)?$/i.test(current) && fromName ? fromName : current || fromName,
    );
  }, [listing.data]);

  const username = listing.data?.username?.trim() || "";
  const origin = SITE_URL.replace(/\/$/, "");
  const slugPreview = slugifyAgentName(slug || listing.data?.name || "agent");
  const publicPath =
    listing.data?.published && username ? `/@${username}/${slugPreview}` : null;
  const publicUrl = publicPath ? `${origin}${publicPath}` : null;

  const visibilityOptions = useMemo(
    () => [
      { value: "private", label: t("agentSettings.visibilityPrivate") },
      { value: "public", label: t("agentSettings.visibilityPublic") },
    ],
    [t],
  );

  const billingOptions = useMemo(
    () => [
      { value: "one_time", label: t("agentSettings.billing.oneTime") },
      { value: "weekly", label: t("agentSettings.billing.weekly") },
      { value: "monthly", label: t("agentSettings.billing.monthly") },
      { value: "yearly", label: t("agentSettings.billing.yearly") },
    ],
    [t],
  );

  if (listing.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <BrandLoader label={t("loading")} />
      </div>
    );
  }

  if (!listing.data) {
    return (
      <div className="flex h-full items-center justify-start px-6 text-sm text-muted-foreground">
        {t("agentSettings.loadError")}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 md:px-8">
      <div className="mr-auto max-w-xl space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("agentSettings.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("agentSettings.subtitle")}</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSaving(true);
            setSaveError(null);
            setSaved(false);
            setSlugAdjusted(false);
            const requestedSlug = slugPreview;
            void updateAgentListingAction({
              agentId,
              visibility,
              tagline,
              // Paid listings are not enabled yet — all agents stay free.
              priceCents: 0,
              billingInterval: "one_time",
              slug: requestedSlug,
            })
              .then((result) => {
                setSaved(true);
                if (result.slug && result.slug !== requestedSlug) {
                  setSlug(result.slug);
                  setSlugAdjusted(true);
                } else if (result.slug) {
                  setSlug(result.slug);
                }
                void queryClient.invalidateQueries({ queryKey: ["agent-listing", agentId] });
                void queryClient.invalidateQueries({ queryKey: ["agents"] });
                void queryClient.invalidateQueries({ queryKey: ["agents", agentId] });
              })
              .catch(() => {
                setSaveError(t("agentSettings.saveError"));
              })
              .finally(() => setSaving(false));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="visibility">{t("agentSettings.visibility")}</Label>
            <DaSelect
              id="visibility"
              value={visibility}
              options={visibilityOptions}
              onChange={(value) => setVisibility(value as ListingVisibility)}
            />
          </div>

          {visibility === "public" ? (
            <>
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
              <div className="space-y-2 rounded-xl border border-border/60 bg-foreground/[0.03] p-3 opacity-70">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{t("agentSettings.pricingTitle")}</p>
                  <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("comingSoon")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{t("agentSettings.pricingComingSoon")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="price">{t("agentSettings.price")}</Label>
                    <Input
                      id="price"
                      type="number"
                      min={0}
                      step={0.01}
                      value="0.00"
                      disabled
                      readOnly
                      className="cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="billing">{t("agentSettings.billingLabel")}</Label>
                    <DaSelect
                      id="billing"
                      value="one_time"
                      options={billingOptions}
                      onChange={() => undefined}
                      disabled
                      className="cursor-not-allowed opacity-80"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="slug">{t("agentSettings.linkSlug")}</Label>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 font-mono text-xs">
              <span className="shrink-0 text-muted-foreground">
                {origin}/@{username || "…"}/
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                onBlur={() => setSlug(slugifyAgentName(slug || listing.data.name))}
                className="h-8 min-w-[10rem] flex-1 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
                placeholder={slugifyAgentName(listing.data.name)}
                disabled={!listing.data.published}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{t("agentSettings.linkSlugHint")}</p>
            {slugAdjusted ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {t("agentSettings.linkSlugAdjusted", { slug: slugPreview })}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="rounded-full" disabled={saving}>
            {saving ? t("loading") : t("actions.save")}
          </Button>
          {saved ? <p className="text-sm text-emerald-600">{t("agentSettings.saved")}</p> : null}
          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
        </form>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("agentSettings.publicLink")}</h2>
          {publicUrl && publicPath ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 break-all rounded-xl bg-foreground/[0.04] px-3 py-2 font-mono text-xs">
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
                <Link href={publicPath}>
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
