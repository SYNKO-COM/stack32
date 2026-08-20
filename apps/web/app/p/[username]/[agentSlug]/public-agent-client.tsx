"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { AgentIaView } from "@/components/builder/agent-ia-view";
import { ReviewForm, ReviewList } from "@/components/marketplace/review-form";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { listAgentReviewsAction, requestAgentAccessAction } from "@/lib/actions/marketplace";
import {
  openPublishedAgentAction,
  toggleFavoriteAction,
} from "@/lib/actions/public-agents";
import type { PublicAgentDto } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function PublicAgentGate({
  agent,
  username,
  agentSlug,
  initialAuthenticated,
}: {
  agent: PublicAgentDto;
  username: string;
  agentSlug: string;
  initialAuthenticated: boolean;
}) {
  const { t } = useTranslation(["common", "errors"]);
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const prettyPath = `/@${username}/${agentSlug}`;
  const authenticated = user ? true : userLoading ? initialAuthenticated : false;

  if (userLoading && !initialAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <BrandLoader label={t("common:loading")} size="lg" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("common:publicAgent.byline", { username: agent.creatorUsername })}
        </p>
        <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {agent.name}
        </h1>
        {agent.description ? (
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            {agent.description}
          </p>
        ) : (
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("common:publicAgent.defaultDescription")}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild className="rounded-full">
            <Link href={`/login?next=${encodeURIComponent(prettyPath)}`}>
              {t("common:publicAgent.signInToUse")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/signup?next=${encodeURIComponent(prettyPath)}`}>
              {t("common:actions.getStarted")}
            </Link>
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            {t("common:actions.backHome")}
          </Link>
        </p>
      </div>
    );
  }

  return <PublicAgentContent agent={agent} username={username} agentSlug={agentSlug} />;
}

function PublicAgentContent({
  agent,
  username,
  agentSlug,
}: {
  agent: PublicAgentDto;
  username: string;
  agentSlug: string;
}) {
  const { t } = useTranslation(["common", "errors"]);

  const query = useQuery({
    queryKey: ["public-agent", username, agentSlug],
    queryFn: () => openPublishedAgentAction(username, agentSlug),
    retry: false,
  });

  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const favorited = favoriteOverride ?? query.data?.favorited ?? false;
  const reviews = useQuery({
    queryKey: ["agent-reviews", query.data?.agent.agentId ?? agent.agentId],
    queryFn: () => listAgentReviewsAction(query.data!.agent.agentId),
    enabled: Boolean(query.data?.agent.agentId && !query.data.needsAccess),
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <BrandLoader label={t("common:loading")} size="lg" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("errors:agentNotFound.title")}
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          {t("errors:agentNotFound.subtitle")}
        </p>
      </div>
    );
  }

  const liveAgent: PublicAgentDto = query.data.agent;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{liveAgent.name}</h1>
          <p className="truncate text-xs text-muted-foreground">
            @{liveAgent.creatorUsername}/{liveAgent.slug}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await toggleFavoriteAction(liveAgent.agentId, favorited);
              setFavoriteOverride(result.favorited);
            });
          }}
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
      </header>
      {query.data.needsAccess ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h2 className="text-xl font-semibold">{t("common:liveAccess.privateTitle")}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {query.data.accessStatus === "pending"
              ? t("common:liveAccess.pending")
              : query.data.accessStatus === "denied"
                ? t("common:liveAccess.denied")
                : t("common:liveAccess.privateBody")}
          </p>
          {query.data.accessStatus === "none" || query.data.accessStatus === "denied" ? (
            <Button
              className="mt-6 rounded-full"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await requestAgentAccessAction(liveAgent.agentId);
                  await query.refetch();
                });
              }}
            >
              {t("common:liveAccess.request")}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1">
            <AgentIaView agentId={liveAgent.agentId} mode="consumer" />
          </div>
          <div className="border-t border-border px-4 py-4 md:px-6">
            <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
              {query.data.isOwner ? null : (
                <ReviewForm
                  agentId={liveAgent.agentId}
                  existing={reviews.data?.find((r) => r.isMine)}
                  onSaved={() => void reviews.refetch()}
                />
              )}
              <div className={query.data.isOwner ? "md:col-span-2" : undefined}>
                <p className="mb-2 text-sm font-medium">{t("common:review.title")}</p>
                <ReviewList reviews={reviews.data ?? []} />
              </div>
            </div>
          </div>
        </>
      )}
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

  if (!agent) {
    return (
      <div className="relative flex h-svh overflow-hidden">
        <AnimatedBackground variant="editor" />
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-6 text-center">
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
      </div>
    );
  }

  return (
    <div className="relative flex h-svh overflow-hidden">
      <AnimatedBackground variant="editor" />
      <div className="flex min-w-0 flex-1 flex-col">
        <PublicAgentGate
          agent={agent}
          username={username}
          agentSlug={agentSlug}
          initialAuthenticated={initialAuthenticated}
        />
      </div>
    </div>
  );
}
