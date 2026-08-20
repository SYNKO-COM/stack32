"use server";

import { getOrCreateInstallation } from "@/lib/actions/installations";
import { clampReviewRating, shuffleArray } from "@/lib/marketplace/shuffle";
import { requireSupabaseServerClient } from "@/lib/supabase/server";

export type ListingVisibility = "private" | "public";

export interface MarketplaceAgentCard {
  agentId: string;
  name: string;
  slug: string;
  description?: string;
  tagline?: string;
  iconKey?: string;
  creatorUsername: string;
  creatorUserId: string;
  priceCents: number;
  currency: string;
  publicPath: string;
  avgRating?: number;
  reviewCount?: number;
}

export interface AgentListingSettings {
  agentId: string;
  name: string;
  slug: string;
  status: string;
  visibility: ListingVisibility;
  tagline: string;
  priceCents: number;
  currency: string;
  publicPath?: string;
  published: boolean;
}

export interface AccessRequestRow {
  id: string;
  requesterId: string;
  requesterName: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
}

export interface AgentReviewRow {
  id: string;
  userId: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
  isMine: boolean;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export async function listMarketplaceAgentsAction(): Promise<MarketplaceAgentCard[]> {
  const supabase = await requireSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC until codegen
  const { data, error } = await (supabase as any).rpc("list_marketplace_agents");
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const cards: MarketplaceAgentCard[] = [];
  for (const raw of rows) {
    const row = asRecord(raw);
    const agentId = typeof row.agentId === "string" ? row.agentId : "";
    const name = typeof row.name === "string" ? row.name : "";
    const slug = typeof row.slug === "string" ? row.slug : "";
    const creatorUsername =
      typeof row.creatorUsername === "string" ? row.creatorUsername : "";
    if (!agentId || !name || !slug || !creatorUsername) continue;
    const avgRating = Number(row.avgRating);
    const reviewCount = Number(row.reviewCount);
    cards.push({
      agentId,
      name,
      slug,
      description: typeof row.description === "string" ? row.description : undefined,
      tagline: typeof row.tagline === "string" ? row.tagline : undefined,
      iconKey: typeof row.iconKey === "string" ? row.iconKey : undefined,
      creatorUsername,
      creatorUserId: typeof row.creatorUserId === "string" ? row.creatorUserId : "",
      priceCents: typeof row.priceCents === "number" ? row.priceCents : Number(row.priceCents) || 0,
      currency: typeof row.currency === "string" ? row.currency : "eur",
      publicPath: `/@${creatorUsername}/${slug}`,
      avgRating: Number.isFinite(avgRating) && avgRating > 0 ? avgRating : undefined,
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : undefined,
    });
  }
  // RPC already orders randomly; shuffle again so a client refetch also reshuffles.
  return shuffleArray(cards);
}

export async function recordAgentViewAction(agentId: string): Promise<void> {
  if (!agentId) return;
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending codegen
  await (supabase as any).from("agent_listing_views").insert({
    agent_id: agentId,
    viewer_id: user.id,
  });
}

export async function getAgentListingSettingsAction(
  agentId: string,
): Promise<AgentListingSettings> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, name, slug, status, listing_visibility, listing_tagline, listing_price_cents, listing_currency")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!agent) throw new Error("not_found");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  const username =
    profile && "username" in profile && typeof profile.username === "string"
      ? profile.username
      : undefined;

  const row = agent as Record<string, unknown>;
  const visibility: ListingVisibility =
    row.listing_visibility === "public" ? "public" : "private";
  const published = row.status === "published";

  return {
    agentId: String(row.id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    status: String(row.status ?? "draft"),
    visibility,
    tagline: typeof row.listing_tagline === "string" ? row.listing_tagline : "",
    priceCents: typeof row.listing_price_cents === "number" ? row.listing_price_cents : 0,
    currency: typeof row.listing_currency === "string" ? row.listing_currency : "eur",
    publicPath:
      published && username ? `/@${username}/${String(row.slug ?? "")}` : undefined,
    published,
  };
}

export async function updateAgentListingAction(input: {
  agentId: string;
  visibility: ListingVisibility;
  tagline: string;
  priceCents: number;
}): Promise<AgentListingSettings> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  if (input.visibility !== "public" && input.visibility !== "private") {
    throw new Error("invalid_visibility");
  }
  const priceCents = Number.isFinite(input.priceCents)
    ? Math.max(0, Math.round(input.priceCents))
    : 0;
  const tagline = input.tagline.trim().slice(0, 160);

  const { error } = await supabase
    .from("agents")
    .update({
      listing_visibility: input.visibility,
      listing_tagline: tagline || null,
      listing_price_cents: priceCents,
    })
    .eq("id", input.agentId)
    .eq("user_id", user.id);
  if (error) throw error;
  return getAgentListingSettingsAction(input.agentId);
}

export async function listAccessRequestsAction(agentId: string): Promise<AccessRequestRow[]> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC
  const { data, error } = await (supabase as any).rpc("list_agent_access_requests", {
    p_agent_id: agentId,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((raw: unknown) => {
    const row = asRecord(raw);
    const status = row.status;
    return {
      id: String(row.id ?? ""),
      requesterId: String(row.requesterId ?? ""),
      requesterName: typeof row.requesterName === "string" ? row.requesterName : "User",
      status: status === "approved" || status === "denied" ? status : "pending",
      createdAt: String(row.createdAt ?? ""),
    };
  });
}

export async function resolveAccessRequestAction(input: {
  requestId: string;
  status: "approved" | "denied";
}): Promise<void> {
  const supabase = await requireSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending codegen
  const { error } = await (supabase as any)
    .from("agent_access_requests")
    .update({ status: input.status, resolved_at: new Date().toISOString() })
    .eq("id", input.requestId);
  if (error) throw error;
}

export async function requestAgentAccessAction(agentId: string): Promise<{ status: string }> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending codegen
  const table = (supabase as any).from("agent_access_requests");
  const { data: existing } = await table
    .select("status")
    .eq("agent_id", agentId)
    .eq("requester_id", user.id)
    .maybeSingle();
  if (existing?.status) return { status: String(existing.status) };
  const { error } = await table.insert({
    agent_id: agentId,
    requester_id: user.id,
    status: "pending",
  });
  if (error) throw error;
  return { status: "pending" };
}

export async function getMyAccessStatusAction(
  agentId: string,
): Promise<"none" | "pending" | "approved" | "denied"> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "none";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending codegen
  const { data } = await (supabase as any)
    .from("agent_access_requests")
    .select("status")
    .eq("agent_id", agentId)
    .eq("requester_id", user.id)
    .maybeSingle();
  const status = data?.status;
  if (status === "pending" || status === "approved" || status === "denied") return status;
  return "none";
}

export async function listAgentReviewsAction(agentId: string): Promise<AgentReviewRow[]> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC
  const { data, error } = await (supabase as any).rpc("list_agent_reviews", {
    p_agent_id: agentId,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((raw: unknown) => {
    const row = asRecord(raw);
    return {
      id: String(row.id ?? ""),
      userId: String(row.userId ?? ""),
      authorName: typeof row.authorName === "string" ? row.authorName : "User",
      rating: typeof row.rating === "number" ? row.rating : 0,
      body: typeof row.body === "string" ? row.body : "",
      createdAt: String(row.createdAt ?? ""),
      isMine: Boolean(row.isMine) || String(row.userId ?? "") === user.id,
    };
  });
}

export async function upsertAgentReviewAction(input: {
  agentId: string;
  rating: number;
  body: string;
}): Promise<void> {
  const rating = clampReviewRating(input.rating);
  if (!rating) throw new Error("invalid_rating");
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { data: owned } = await supabase
    .from("agents")
    .select("id")
    .eq("id", input.agentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (owned) throw new Error("cannot_review_own_agent");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending codegen
  const { error } = await (supabase as any).from("agent_reviews").upsert(
    {
      agent_id: input.agentId,
      user_id: user.id,
      rating,
      body: input.body.trim().slice(0, 2000) || null,
    },
    { onConflict: "agent_id,user_id" },
  );
  if (error) throw error;
}

export async function getCreatorDashboardAction(): Promise<{
  agents: Array<{
    agentId: string;
    name: string;
    views: number;
    subscribers: number;
    revenueCents: number;
    reviewCount: number;
    avgRating: number | null;
    subscriberNames: string[];
    buyerNames: string[];
    reviews: AgentReviewRow[];
  }>;
}> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data: owned } = await supabase
    .from("agents")
    .select("id, name")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const agents = [];
  for (const agent of owned ?? []) {
    const agentId = agent.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending codegen
    const viewsTable = (supabase as any).from("agent_listing_views");
    const { count: viewCount } = await viewsTable
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId);

    const { count: installCount } = await supabase
      .from("agent_installations")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .neq("user_id", user.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending codegen
    const { data: purchases } = await (supabase as any)
      .from("agent_listing_purchases")
      .select("amount_cents, buyer_id")
      .eq("agent_id", agentId);
    const revenueCents = (purchases ?? []).reduce(
      (sum: number, row: { amount_cents?: number }) => sum + (row.amount_cents ?? 0),
      0,
    );

    const reviews = await listAgentReviewsAction(agentId);
    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC
    const { data: audience } = await (supabase as any).rpc("list_agent_audience", {
      p_agent_id: agentId,
    });
    const aud = asRecord(audience);
    const subscribers = Array.isArray(aud.subscribers) ? aud.subscribers : [];
    const buyers = Array.isArray(aud.buyers) ? aud.buyers : [];

    agents.push({
      agentId,
      name: agent.name,
      views: viewCount ?? 0,
      subscribers: installCount ?? subscribers.length,
      revenueCents,
      reviewCount: reviews.length,
      avgRating,
      subscriberNames: subscribers
        .map((s: unknown) => asRecord(s).name)
        .filter((n: unknown): n is string => typeof n === "string"),
      buyerNames: buyers
        .map((s: unknown) => asRecord(s).name)
        .filter((n: unknown): n is string => typeof n === "string"),
      reviews,
    });
  }

  return { agents };
}

export async function openMarketplaceAgentAction(
  username: string,
  agentSlug: string,
): Promise<{
  agentId: string;
  name: string;
  publicPath: string;
  needsAccess: boolean;
  accessStatus: "none" | "pending" | "approved" | "denied";
  isOwner: boolean;
  installationId?: string;
}> {
  const { resolvePublishedAgentAction } = await import("@/lib/actions/public-agents");
  const agent = await resolvePublishedAgentAction(username, agentSlug);
  if (!agent) throw new Error("not_found");
  await recordAgentViewAction(agent.agentId);

  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const isOwner = agent.creatorUserId === user.id;
  const { data: listing } = await supabase
    .from("agents")
    .select("listing_visibility")
    .eq("id", agent.agentId)
    .maybeSingle();
  const visibility =
    listing && "listing_visibility" in listing && listing.listing_visibility === "public"
      ? "public"
      : "private";

  if (isOwner || visibility === "public") {
    const installation = await getOrCreateInstallation(agent.agentId);
    return {
      agentId: agent.agentId,
      name: agent.name,
      publicPath: `/@${agent.creatorUsername}/${agent.slug}`,
      needsAccess: false,
      accessStatus: "approved",
      isOwner,
      installationId: installation.id,
    };
  }

  const accessStatus = await getMyAccessStatusAction(agent.agentId);
  if (accessStatus === "approved") {
    const installation = await getOrCreateInstallation(agent.agentId);
    return {
      agentId: agent.agentId,
      name: agent.name,
      publicPath: `/@${agent.creatorUsername}/${agent.slug}`,
      needsAccess: false,
      accessStatus,
      isOwner,
      installationId: installation.id,
    };
  }

  return {
    agentId: agent.agentId,
    name: agent.name,
    publicPath: `/@${agent.creatorUsername}/${agent.slug}`,
    needsAccess: true,
    accessStatus,
    isOwner,
  };
}
