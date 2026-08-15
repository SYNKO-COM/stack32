"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState, useTransition } from "react";

import { AgentIaView } from "@/components/builder/agent-ia-view";
import { RequireAuth } from "@/components/auth/require-auth";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import {
  openPublishedAgentAction,
  toggleFavoriteAction,
} from "@/lib/actions/public-agents";
import type { PublicAgentDto } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function PublicAgentContent() {
  const { t } = useTranslation(["common", "errors"]);
  const params = useParams<{ username: string; agentSlug: string }>();
  const username = decodeURIComponent(params.username ?? "").toLowerCase();
  const agentSlug = decodeURIComponent(params.agentSlug ?? "").toLowerCase();

  const query = useQuery({
    queryKey: ["public-agent", username, agentSlug],
    queryFn: () => openPublishedAgentAction(username, agentSlug),
    retry: false,
  });

  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const favorited = favoriteOverride ?? query.data?.favorited ?? false;

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

  const agent: PublicAgentDto = query.data.agent;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{agent.name}</h1>
          <p className="truncate text-xs text-muted-foreground">
            @{agent.creatorUsername}/{agent.slug}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await toggleFavoriteAction(agent.agentId, favorited);
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
      <div className="min-h-0 flex-1">
        <AgentIaView agentId={agent.agentId} mode="consumer" />
      </div>
    </div>
  );
}

export default function PublicAgentPage() {
  return (
    <RequireAuth>
      <div className="relative flex h-svh overflow-hidden">
        <AnimatedBackground variant="editor" />
        <div className="flex min-w-0 flex-1 flex-col">
          <PublicAgentContent />
        </div>
      </div>
    </RequireAuth>
  );
}
