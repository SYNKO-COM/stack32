"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Heart,
  Loader2,
  Sparkles,
  Star,
  Target,
  Workflow,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { AgentIaView } from "@/components/builder/agent-ia-view";
import { AgentIcon } from "@/components/builder/agent-icon";
import { PublicAgentChrome } from "@/components/marketplace/public-agent-chrome";
import { ReviewForm, ReviewList } from "@/components/marketplace/review-form";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import {
  listAgentReviewsAction,
  requestAgentAccessAction,
} from "@/lib/actions/marketplace";
import {
  getPublishedAgentAudienceAction,
  openPublishedAgentAction,
  subscribePublishedAgentAction,
  toggleFavoriteAction,
} from "@/lib/actions/public-agents";
import type { PublicAgentDto } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function formatRating(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

function PublicAgentLanding({
  agent,
  username,
  agentSlug,
  onUse,
}: {
  agent: PublicAgentDto;
  username: string;
  agentSlug: string;
  onUse: () => void;
}) {
  const { t } = useTranslation(["common", "errors"]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const prettyPath = `/@${username}/${agentSlug}`;
  const [pending, startTransition] = useTransition();
  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(null);

  const audience = useQuery({
    queryKey: ["public-agent-audience", username, agentSlug],
    queryFn: () => getPublishedAgentAudienceAction(username, agentSlug),
    enabled: !userLoading,
  });

  const reviews = useQuery({
    queryKey: ["agent-reviews", agent.agentId],
    queryFn: () => listAgentReviewsAction(agent.agentId),
  });

  const favorited = favoriteOverride ?? audience.data?.favorited ?? false;
  const subscribed = audience.data?.subscribed ?? false;
  const needsAccess = audience.data?.needsAccess ?? agent.listingVisibility === "private";
  const accessStatus = audience.data?.accessStatus ?? "none";
  const isOwner = audience.data?.isOwner ?? false;

  const goAuth = (mode: "login" | "signup") => {
    router.push(`/${mode}?next=${encodeURIComponent(prettyPath)}`);
  };

  const handleSubscribe = () => {
    if (!user) {
      goAuth("signup");
      return;
    }
    startTransition(async () => {
      const next = await subscribePublishedAgentAction(username, agentSlug);
      await queryClient.invalidateQueries({
        queryKey: ["public-agent-audience", username, agentSlug],
      });
      if (!next.needsAccess) {
        // Stay on landing with Utiliser CTA — user chooses when to enter.
      }
    });
  };

  const handleUse = () => {
    if (!user) {
      goAuth("login");
      return;
    }
    startTransition(async () => {
      if (!subscribed) {
        await subscribePublishedAgentAction(username, agentSlug);
        await queryClient.invalidateQueries({
          queryKey: ["public-agent-audience", username, agentSlug],
        });
      }
      onUse();
    });
  };

  const handleFavorite = () => {
    if (!user) {
      goAuth("login");
      return;
    }
    startTransition(async () => {
      const result = await toggleFavoriteAction(agent.agentId, favorited);
      setFavoriteOverride(result.favorited);
    });
  };

  const description =
    agent.tagline?.trim() ||
    agent.description?.trim() ||
    t("common:publicAgent.defaultDescription");

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 md:px-6 md:py-14">
        <section className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-4">
              <AgentIcon
                icon={agent.iconKey || "bot"}
                className="size-16 rounded-3xl md:size-[4.5rem]"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t("common:publicAgent.byline", { username: agent.creatorUsername })}
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {agent.name}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {description}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {(agent.reviewCount ?? 0) > 0
                    ? t("common:publicAgent.ratingLabel", {
                        rating: formatRating(agent.avgRating),
                        count: agent.reviewCount ?? 0,
                      })
                    : t("common:publicAgent.ratingEmpty")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-stretch">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
              disabled={pending}
              onClick={handleFavorite}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Heart
                  className={cn("size-3.5", favorited && "fill-current text-brand")}
                  aria-hidden="true"
                />
              )}
              {favorited ? t("common:myAgents.unfavorite") : t("common:myAgents.favorite")}
            </Button>

            {needsAccess && !isOwner ? (
              <>
                <p className="max-w-xs text-sm text-muted-foreground md:text-right">
                  {accessStatus === "pending"
                    ? t("common:liveAccess.pending")
                    : accessStatus === "denied"
                      ? t("common:liveAccess.denied")
                      : t("common:liveAccess.privateBody")}
                </p>
                {accessStatus === "none" || accessStatus === "denied" ? (
                  <Button
                    className="rounded-full"
                    disabled={pending || !user}
                    onClick={() => {
                      if (!user) {
                        goAuth("signup");
                        return;
                      }
                      startTransition(async () => {
                        await requestAgentAccessAction(agent.agentId);
                        await audience.refetch();
                      });
                    }}
                  >
                    {t("common:liveAccess.request")}
                  </Button>
                ) : null}
              </>
            ) : subscribed ? (
              <Button className="rounded-full" disabled={pending} onClick={handleUse}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {t("common:publicAgent.use")}
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button className="rounded-full" disabled={pending} onClick={handleSubscribe}>
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {t("common:publicAgent.subscribe")}
                </Button>
                {!user ? (
                  <p className="max-w-xs text-xs text-muted-foreground md:text-right">
                    {t("common:publicAgent.signInRequired")}{" "}
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      onClick={() => goAuth("login")}
                    >
                      {t("common:actions.signIn")}
                    </button>
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {(agent.role || agent.goal || agent.instructions || (agent.rules && agent.rules.length > 0)) ? (
          <section className="rounded-3xl border border-border/80 bg-background/60 p-5 backdrop-blur-sm md:p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand/12 text-brand">
                <BookOpen className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{t("common:publicAgent.briefTitle")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("common:publicAgent.briefHint")}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {agent.role ? (
                <div className="rounded-2xl border border-border/70 bg-foreground/[0.02] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Sparkles className="size-3.5 text-brand" aria-hidden="true" />
                    {t("common:publicAgent.roleTitle")}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{agent.role}</p>
                </div>
              ) : null}

              {agent.goal ? (
                <div className="rounded-2xl border border-border/70 bg-foreground/[0.02] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Target className="size-3.5 text-brand" aria-hidden="true" />
                    {t("common:publicAgent.goalTitle")}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {agent.goal}
                  </p>
                </div>
              ) : null}

              {agent.instructions ? (
                <div className="rounded-2xl border border-border/70 bg-foreground/[0.02] p-4 md:col-span-2">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <BookOpen className="size-3.5 text-brand" aria-hidden="true" />
                    {t("common:publicAgent.instructionsTitle")}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {agent.instructions}
                  </p>
                </div>
              ) : null}

              {agent.rules && agent.rules.length > 0 ? (
                <div className="rounded-2xl border border-border/70 bg-foreground/[0.02] p-4 md:col-span-2">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <ShieldCheck className="size-3.5 text-brand" aria-hidden="true" />
                    {t("common:publicAgent.rulesTitle")}
                  </div>
                  <ol className="mt-3 space-y-2.5">
                    {agent.rules.map((rule, index) => (
                      <li key={`${index}-${rule.slice(0, 24)}`} className="flex gap-3 text-sm">
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand">
                          {index + 1}
                        </span>
                        <span className="leading-relaxed text-foreground/90">{rule}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-border/80 bg-background/60 p-5 backdrop-blur-sm md:p-6">
          <div className="flex items-center gap-2">
            <Workflow className="size-4 text-brand" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t("common:publicAgent.structureTitle")}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("common:publicAgent.structureHint")}
          </p>
          {agent.modules && agent.modules.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {agent.modules.map((mod) => (
                <li
                  key={mod.label}
                  className="rounded-full border border-border bg-foreground/[0.03] px-3 py-1.5 text-xs font-medium"
                >
                  {mod.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("common:publicAgent.modulesEmpty")}
            </p>
          )}
        </section>

        <section className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Star className="size-4 text-brand" aria-hidden="true" />
              <h2 className="text-sm font-semibold">{t("common:publicAgent.reviewsTitle")}</h2>
            </div>
            <ReviewList reviews={reviews.data ?? []} />
          </div>
          {user && !isOwner ? (
            <ReviewForm
              agentId={agent.agentId}
              existing={reviews.data?.find((r) => r.isMine)}
              onSaved={() => void reviews.refetch()}
            />
          ) : !user ? (
            <div className="rounded-2xl border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
              {t("common:publicAgent.signInRequired")}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function CreateOwnAgentCard() {
  const { t } = useTranslation("common");
  return (
    <Link
      href="/agents"
      className="group fixed bottom-4 right-4 z-30 max-w-[220px] rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur-md transition hover:border-brand/40 hover:shadow-xl sm:bottom-6 sm:right-6"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-sm font-semibold leading-snug group-hover:text-brand">
            {t("publicAgent.createOwnAgent")}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            {t("publicAgent.createOwnAgentHint")}
          </span>
        </span>
      </div>
    </Link>
  );
}

function PublicAgentUseView({
  agent,
  username,
  agentSlug,
  onBack,
}: {
  agent: PublicAgentDto;
  username: string;
  agentSlug: string;
  onBack: () => void;
}) {
  const { t } = useTranslation(["common", "errors"]);
  const query = useQuery({
    queryKey: ["public-agent-open", username, agentSlug],
    queryFn: () => openPublishedAgentAction(username, agentSlug),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <BrandLoader label={t("common:loading")} size="lg" />
      </div>
    );
  }

  if (query.isError || !query.data || query.data.needsAccess) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h2 className="text-xl font-semibold">{t("common:liveAccess.privateTitle")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {query.data?.accessStatus === "pending"
            ? t("common:liveAccess.pending")
            : t("common:liveAccess.privateBody")}
        </p>
        <Button variant="outline" className="rounded-full" onClick={onBack}>
          {t("common:publicAgent.backToListing")}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 md:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{agent.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            @{agent.creatorUsername}/{agent.slug}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onBack}>
          {t("common:publicAgent.backToListing")}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <AgentIaView
          agentId={query.data.agent.agentId}
          mode="consumer"
          installationId={query.data.installationId}
        />
      </div>
      <CreateOwnAgentCard />
    </div>
  );
}

export function PublicAgentClient({
  agent,
  username,
  agentSlug,
  initialAuthenticated,
}: {
  agent: PublicAgentDto | null;
  username: string;
  agentSlug: string;
  initialAuthenticated: boolean;
}) {
  const { t } = useTranslation(["common", "errors"]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const prettyPath = `/@${username}/${agentSlug}`;
  const useMode = searchParams.get("use") === "1";

  const enterUse = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("use", "1");
    router.push(`${prettyPath}?${params.toString()}`);
  };

  const leaveUse = () => {
    router.push(prettyPath);
  };

  if (!agent) {
    return (
      <div className="relative flex h-svh overflow-hidden">
        <AnimatedBackground variant="editor" />
        <PublicAgentChrome loginNext={prettyPath}>
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("errors:agentNotFound.title")}
            </h1>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              {t("errors:agentNotFound.subtitle")}
            </p>
            <Button asChild className="mt-8 rounded-full">
              <Link href="/">{t("common:actions.backHome")}</Link>
            </Button>
          </div>
        </PublicAgentChrome>
      </div>
    );
  }

  // Avoid unused warning while keeping SSR auth hint available for future gates.
  void initialAuthenticated;

  return (
    <div className="relative flex h-svh overflow-hidden">
      <AnimatedBackground variant="editor" />
      <PublicAgentChrome loginNext={prettyPath} accountMode="workspace">
        {useMode ? (
          <PublicAgentUseView
            agent={agent}
            username={username}
            agentSlug={agentSlug}
            onBack={leaveUse}
          />
        ) : (
          <PublicAgentLanding
            agent={agent}
            username={username}
            agentSlug={agentSlug}
            onUse={enterUse}
          />
        )}
      </PublicAgentChrome>
    </div>
  );
}
