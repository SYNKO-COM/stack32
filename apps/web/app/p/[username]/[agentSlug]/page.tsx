import type { Metadata } from "next";
import { Suspense } from "react";

import { JsonLd } from "@/components/seo/json-ld";
import { BrandLoader } from "@/components/shared/brand-loader";
import { resolvePublishedAgentAction } from "@/lib/actions/public-agents";
import { buildPageMetadata, publicAgentJsonLd, SITE_NAME } from "@/lib/seo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PublicAgentClient } from "./public-agent-client";

type PageProps = {
  params: Promise<{ username: string; agentSlug: string }>;
};

async function loadAgent(username: string, agentSlug: string) {
  try {
    return await resolvePublishedAgentAction(username, agentSlug);
  } catch {
    return null;
  }
}

async function loadIsAuthenticated(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return false;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username: rawUser, agentSlug: rawSlug } = await params;
  const username = decodeURIComponent(rawUser ?? "").toLowerCase();
  const agentSlug = decodeURIComponent(rawSlug ?? "").toLowerCase();
  const path = `/@${username}/${agentSlug}`;
  const agent = await loadAgent(username, agentSlug);

  if (!agent) {
    return buildPageMetadata({
      title: "Agent not found",
      description: "This Stack32 agent does not exist or is no longer published.",
      path,
      noIndex: true,
    });
  }

  const description =
    agent.tagline?.trim() ||
    agent.description?.trim() ||
    `${agent.name} — AI agent by @${agent.creatorUsername} on ${SITE_NAME}. Describe what you need; Stack32 builds agents you can use immediately.`;

  return buildPageMetadata({
    title: `${agent.name} · @${agent.creatorUsername}`,
    description,
    path,
  });
}

export default async function PublicAgentPage({ params }: PageProps) {
  const { username: rawUser, agentSlug: rawSlug } = await params;
  const username = decodeURIComponent(rawUser ?? "").toLowerCase();
  const agentSlug = decodeURIComponent(rawSlug ?? "").toLowerCase();
  const [agent, initialAuthenticated] = await Promise.all([
    loadAgent(username, agentSlug),
    loadIsAuthenticated(),
  ]);

  return (
    <>
      {agent ? (
        <JsonLd
          data={publicAgentJsonLd({
            name: agent.name,
            description: agent.description ?? agent.tagline,
            path: `/@${agent.creatorUsername}/${agent.slug}`,
            creatorUsername: agent.creatorUsername,
          })}
        />
      ) : null}
      <Suspense
        fallback={
          <div className="flex h-svh items-center justify-center">
            <BrandLoader size="lg" />
          </div>
        }
      >
        <PublicAgentClient
          agent={agent}
          username={username}
          agentSlug={agentSlug}
          initialAuthenticated={initialAuthenticated}
        />
      </Suspense>
    </>
  );
}
