"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, ImagePlus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentIcon, AGENT_ICON_KEYS } from "@/components/builder/agent-icon";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { DaSelect } from "@/components/ui/da-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/use-translation";
import {
  getAgentListingSettingsAction,
  listAccessRequestsAction,
  resolveAccessRequestAction,
  updateAgentListingAction,
  type ListingVisibility,
} from "@/lib/actions/marketplace";
import {
  isAgentIconImageUrl,
  uploadAgentAvatar,
} from "@/lib/marketplace/agent-avatar";
import { slugifyAgentName } from "@/lib/marketplace/slug";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export default function AgentSettingsPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState("bot");
  const [role, setRole] = useState("");
  const [goal, setGoal] = useState("");
  const [instructions, setInstructions] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [visibility, setVisibility] = useState<ListingVisibility>("private");
  const [tagline, setTagline] = useState("");
  const [slug, setSlug] = useState("");
  const [saved, setSaved] = useState(false);
  const [slugAdjusted, setSlugAdjusted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const slugFollowsName = useRef(true);
  const loadedNameSlug = useRef({ name: "", slug: "" });

  useEffect(() => {
    if (!listing.data) return;
    setName(listing.data.name);
    setIconKey(listing.data.iconKey || "bot");
    setRole(listing.data.role);
    setGoal(listing.data.goal);
    setInstructions(listing.data.instructions);
    setRulesText(listing.data.rules.join("\n"));
    setVisibility(listing.data.visibility);
    setTagline(listing.data.tagline);
    const current = listing.data.slug || "";
    const fromName = slugifyAgentName(listing.data.name);
    const nextSlug =
      /^untitled-agent(-[0-9]+)?$/i.test(current) && fromName ? fromName : current || fromName;
    setSlug(nextSlug);
    loadedNameSlug.current = { name: listing.data.name, slug: nextSlug };
    slugFollowsName.current =
      !nextSlug || nextSlug === fromName || nextSlug.startsWith(`${fromName}-`);
  }, [listing.data]);

  const username = listing.data?.username?.trim() || "";
  const origin = SITE_URL.replace(/\/$/, "");
  const slugPreview = slugifyAgentName(slug || name || "agent");
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

  const handleUpload = async (file: File | undefined) => {
    if (!file || !agentId) return;
    setUploading(true);
    setSaveError(null);
    try {
      const url = await uploadAgentAvatar({ agentId, file });
      setIconKey(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "file_too_large") {
        setSaveError(t("agentSettings.iconTooLarge"));
      } else if (message === "invalid_image_type") {
        setSaveError(t("agentSettings.iconInvalidType"));
      } else {
        setSaveError(t("agentSettings.iconUploadError"));
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
    <div className="h-full overflow-y-auto px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1400px] space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("agentSettings.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("agentSettings.subtitle")}</p>
        </div>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSaving(true);
            setSaveError(null);
            setSaved(false);
            setSlugAdjusted(false);
            const requestedSlug = slugPreview;
            const rules = rulesText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            void updateAgentListingAction({
              agentId,
              name: name.trim(),
              iconKey,
              role,
              goal,
              instructions,
              rules,
              visibility,
              tagline,
              priceCents: 0,
              billingInterval: "one_time",
              slug: requestedSlug,
            })
              .then((result) => {
                if (!result.ok) {
                  if (result.code === "duplicate_name") {
                    setSaveError(t("agentSettings.duplicateName"));
                  } else if (result.code === "invalid_name") {
                    setSaveError(t("agentSettings.invalidName"));
                  } else {
                    setSaveError(t("agentSettings.saveError"));
                  }
                  return;
                }
                const next = result.settings;
                setSaved(true);
                setName(next.name);
                setIconKey(next.iconKey);
                setRole(next.role);
                setGoal(next.goal);
                setInstructions(next.instructions);
                setRulesText(next.rules.join("\n"));
                if (result.slugAdjusted && next.slug) {
                  setSlug(next.slug);
                  setSlugAdjusted(true);
                } else if (next.slug) {
                  setSlug(next.slug);
                }
                loadedNameSlug.current = { name: next.name, slug: next.slug };
                void queryClient.invalidateQueries({ queryKey: ["agent-listing", agentId] });
                void queryClient.invalidateQueries({ queryKey: ["agents"] });
                void queryClient.invalidateQueries({ queryKey: ["agents", agentId] });
                void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "spec"] });
                void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "graph"] });
              })
              .catch(() => {
                setSaveError(t("agentSettings.saveError"));
              })
              .finally(() => setSaving(false));
          }}
        >
          <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6 xl:gap-8">
            {/* Left: identity & brief */}
            <section className="space-y-4 rounded-2xl border border-border/70 bg-background/50 p-4 md:p-5">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  {t("agentSettings.profileTitle")}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("agentSettings.profileHint")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("agentSettings.icon")}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={cn(
                      "relative flex size-[3.25rem] items-center justify-center overflow-hidden rounded-2xl border border-dashed transition",
                      isAgentIconImageUrl(iconKey)
                        ? "border-brand ring-1 ring-brand/30"
                        : "border-border/80 hover:border-brand/50 hover:bg-brand/[0.04]",
                    )}
                    aria-label={t("agentSettings.iconUpload")}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
                    ) : isAgentIconImageUrl(iconKey) ? (
                      <AgentIcon icon={iconKey} className="size-full rounded-2xl" />
                    ) : (
                      <ImagePlus className="size-4 text-muted-foreground" aria-hidden="true" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void handleUpload(e.target.files?.[0])}
                  />
                  {AGENT_ICON_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIconKey(key)}
                      className={cn(
                        "rounded-2xl border p-1.5 transition",
                        iconKey === key
                          ? "border-brand bg-brand/10 ring-1 ring-brand/30"
                          : "border-border/70 hover:border-border hover:bg-foreground/[0.03]",
                      )}
                      aria-label={key}
                      aria-pressed={iconKey === key}
                    >
                      <AgentIcon icon={key} className="size-10 rounded-xl" />
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">{t("agentSettings.iconHint")}</p>
                <p className="text-[11px] text-muted-foreground">{t("agentSettings.iconUploadHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-name">{t("agentSettings.name")}</Label>
                <Input
                  id="agent-name"
                  value={name}
                  onChange={(e) => {
                    const next = e.target.value;
                    setName(next);
                    if (slugFollowsName.current) {
                      setSlug(slugifyAgentName(next || "agent"));
                    }
                  }}
                  placeholder={t("agentSettings.namePlaceholder")}
                  maxLength={80}
                  required
                />
                <p className="text-[11px] text-muted-foreground">{t("agentSettings.nameHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-role">{t("agentSettings.role")}</Label>
                <Input
                  id="agent-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder={t("agentSettings.rolePlaceholder")}
                  maxLength={240}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-goal">{t("agentSettings.goal")}</Label>
                <Textarea
                  id="agent-goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={t("agentSettings.goalPlaceholder")}
                  className="min-h-24"
                  maxLength={4000}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-instructions">{t("agentSettings.instructions")}</Label>
                <Textarea
                  id="agent-instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={t("agentSettings.instructionsPlaceholder")}
                  className="min-h-36"
                  maxLength={12000}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-rules">{t("agentSettings.rules")}</Label>
                <Textarea
                  id="agent-rules"
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  placeholder={t("agentSettings.rulesPlaceholder")}
                  className="min-h-28 font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">{t("agentSettings.rulesHint")}</p>
              </div>
            </section>

            {/* Right: live access, marketplace, link */}
            <div className="space-y-5 rounded-2xl border border-border/70 bg-background/50 p-4 md:p-5">
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
                    <p className="text-xs text-muted-foreground">
                      {t("agentSettings.pricingComingSoon")}
                    </p>
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
                    onChange={(e) => {
                      slugFollowsName.current = false;
                      setSlug(e.target.value);
                    }}
                    onBlur={() => setSlug(slugifyAgentName(slug || name))}
                    className="h-8 min-w-[10rem] flex-1 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
                    placeholder={slugifyAgentName(name)}
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

              <div className="space-y-2">
                <Button type="submit" className="rounded-full" disabled={saving || uploading}>
                  {saving ? t("loading") : t("actions.save")}
                </Button>
                {saved ? (
                  <p className="text-sm text-emerald-600">{t("agentSettings.saved")}</p>
                ) : null}
                {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
              </div>

              <section className="space-y-2 border-t border-border/60 pt-4">
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

              <section className="space-y-3 border-t border-border/60 pt-4">
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
                              type="button"
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
                              type="button"
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
        </form>
      </div>
    </div>
  );
}
