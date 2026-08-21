"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  Heart,
  Loader2,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import { AgentIaView } from "@/components/builder/agent-ia-view";
import { AgentIcon } from "@/components/builder/agent-icon";
import { PublicAgentChrome } from "@/components/marketplace/public-agent-chrome";
import { PublicAgentStructurePreview } from "@/components/marketplace/public-agent-structure-preview";
import {
  ReviewCarousel,
  ReviewForm,
} from "@/components/marketplace/review-form";
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

function BriefAccordionItem({
  id,
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = `${id}-panel`;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border transition-[border-color,box-shadow,background-color] duration-300",
        open
          ? "border-brand/35 bg-brand/[0.04] shadow-[0_0_0_1px_rgba(249,115,22,0.08)]"
          : "border-border/70 bg-foreground/[0.02] hover:border-border hover:bg-foreground/[0.035]",
      )}
    >
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
            open ? "bg-brand/15 text-brand" : "bg-foreground/[0.05] text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-foreground uppercase">
          {title}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
            open && "rotate-180 text-brand",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              "border-t border-border/50 px-4 pb-4 pt-3 transition-opacity duration-300",
              open ? "opacity-100" : "opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
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
  const accordionBaseId = useId();
  /** `undefined` = open the first available section by default. */
  const [openBrief, setOpenBrief] = useState<string | null | undefined>(undefined);

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

  const briefItems = [
    agent.role
      ? {
          id: "role",
          title: t("common:publicAgent.roleTitle"),
          icon: Sparkles,
          body: (
            <p className="text-sm leading-relaxed text-foreground">{agent.role}</p>
          ),
        }
      : null,
    agent.goal
      ? {
          id: "goal",
          title: t("common:publicAgent.goalTitle"),
          icon: Target,
          body: (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {agent.goal}
            </p>
          ),
        }
      : null,
    agent.instructions
      ? {
          id: "instructions",
          title: t("common:publicAgent.instructionsTitle"),
          icon: BookOpen,
          body: (
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 scrollbar-thin">
              {agent.instructions}
            </p>
          ),
        }
      : null,
    agent.rules && agent.rules.length > 0
      ? {
          id: "rules",
          title: t("common:publicAgent.rulesTitle"),
          icon: ShieldCheck,
          body: (
            <ol className="max-h-64 space-y-2.5 overflow-y-auto scrollbar-thin">
              {agent.rules.map((rule, index) => (
                <li key={`${index}-${rule.slice(0, 24)}`} className="flex gap-3 text-sm">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed text-foreground/90">{rule}</span>
                </li>
              ))}
            </ol>
          ),
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string;
    title: string;
    icon: LucideIcon;
    body: ReactNode;
  }>;

  const activeBriefId =
    openBrief === undefined ? (briefItems[0]?.id ?? null) : openBrief;

  const goAuth = (mode: "login" | "signup") => {
    router.push(`/${mode}?next=${encodeURIComponent(prettyPath)}`);
  };

  const handleSubscribe = () => {
    if (!user) {
      goAuth("signup");
      return;
    }
    startTransition(async () => {
      await subscribePublishedAgentAction(username, agentSlug);
      await queryClient.invalidateQueries({
        queryKey: ["public-agent-audience", username, agentSlug],
      });
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
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-8 sm:px-6 md:gap-10 md:py-10 lg:px-10 xl:px-12">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md md:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -left-10 size-48 rounded-full bg-brand/[0.06] blur-3xl"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-4 md:gap-5">
                <AgentIcon
                  icon={agent.iconKey || "bot"}
                  className="size-16 rounded-3xl ring-1 ring-brand/20 md:size-[4.5rem]"
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                    {t("common:publicAgent.byline", { username: agent.creatorUsername })}
                  </p>
                  <h1 className="mt-1.5 text-3xl font-semibold tracking-tight sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
                    {agent.name}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {description}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Star className="size-3.5 text-brand" aria-hidden="true" />
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

            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-full border-brand/40 text-brand hover:bg-brand/5 hover:text-brand"
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
                  <p className="max-w-xs text-sm text-muted-foreground lg:text-right">
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
                <Button className="rounded-full px-6" disabled={pending} onClick={handleUse}>
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {t("common:publicAgent.use")}
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    className="rounded-full px-6"
                    disabled={pending}
                    onClick={handleSubscribe}
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {t("common:publicAgent.subscribe")}
                  </Button>
                  {!user ? (
                    <p className="max-w-xs text-xs text-muted-foreground lg:text-right">
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
          </div>
        </section>

        {/* Brief + Structure */}
        <section className="grid min-h-0 gap-5 lg:grid-cols-2 lg:gap-6 xl:gap-8">
          <div className="flex min-h-[34rem] md:min-h-[36rem] flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/70 p-5 backdrop-blur-md md:p-6">
            <div className="mb-4 flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand/12 text-brand">
                <BookOpen className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">
                  {t("common:publicAgent.briefTitle")}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("common:publicAgent.briefHint")}
                </p>
              </div>
            </div>

            {briefItems.length > 0 ? (
              <div className="flex flex-1 flex-col gap-2.5">
                {briefItems.map((item) => (
                  <BriefAccordionItem
                    key={item.id}
                    id={`${accordionBaseId}-${item.id}`}
                    title={item.title}
                    icon={item.icon}
                    open={activeBriefId === item.id}
                    onToggle={() =>
                      setOpenBrief(activeBriefId === item.id ? null : item.id)
                    }
                  >
                    {item.body}
                  </BriefAccordionItem>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("common:publicAgent.briefHint")}
              </p>
            )}
          </div>

          <div className="flex min-h-[34rem] md:min-h-[36rem] flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/70 backdrop-blur-md">
            <div className="flex items-start gap-3 border-b border-border/60 px-5 py-4 md:px-6">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand/12 text-brand">
                <Workflow className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">
                  {t("common:publicAgent.structureTitle")}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("common:publicAgent.structureHint")}
                </p>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_1px_1px,rgba(120,120,128,0.18)_1px,transparent_0)] [background-size:18px_18px]">
              <PublicAgentStructurePreview agent={agent} className="absolute inset-0" />
            </div>
          </div>
        </section>

        {/* Reviews */}
        <section className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5 backdrop-blur-md md:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand/12 text-brand">
                <Star className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  {t("common:publicAgent.reviewsTitle")}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("common:publicAgent.reviewsHint")}
                </p>
              </div>
            </div>
          </div>

          <ReviewCarousel reviews={reviews.data ?? []} />

          <div className="mt-6 border-t border-border/60 pt-5">
            {user && !isOwner ? (
              <ReviewForm
                agentId={agent.agentId}
                existing={reviews.data?.find((r) => r.isMine)}
                onSaved={() => void reviews.refetch()}
              />
            ) : !user ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-foreground/[0.02] p-4 text-sm text-muted-foreground">
                {t("common:publicAgent.signInRequired")}{" "}
                <button
                  type="button"
                  className="font-medium text-brand underline-offset-2 hover:underline"
                  onClick={() => goAuth("login")}
                >
                  {t("common:actions.signIn")}
                </button>
              </div>
            ) : null}
          </div>
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
      <PublicAgentChrome
        loginNext={prettyPath}
        accountMode="workspace"
        onBack={useMode ? leaveUse : undefined}
      >
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
