"use server";

import { openMarketplaceAgentAction } from "@/lib/actions/marketplace";
import { getOrCreateInstallation } from "@/lib/actions/installations";
import type { PublicAgentDto } from "@/lib/domain/types";
import { requireSupabaseServerClient } from "@/lib/supabase/server";

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function mapPublicAgent(raw: unknown): PublicAgentDto | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const agentId = typeof row.agentId === "string" ? row.agentId : "";
  const name = typeof row.name === "string" ? row.name : "";
  const slug = typeof row.slug === "string" ? row.slug : "";
  const creatorUsername =
    typeof row.creatorUsername === "string" ? row.creatorUsername : "";
  const creatorUserId = typeof row.creatorUserId === "string" ? row.creatorUserId : "";
  const deploymentId = typeof row.deploymentId === "string" ? row.deploymentId : "";
  if (!agentId || !name || !slug || !creatorUsername || !creatorUserId || !deploymentId) {
    return null;
  }
  const modulesRaw = Array.isArray(row.modules) ? row.modules : [];
  const modules: Array<{ label: string; kind?: string }> = [];
  for (const m of modulesRaw) {
    const mod = asRecord(m);
    const label = typeof mod.label === "string" ? mod.label : "";
    if (!label) continue;
    modules.push({
      label,
      kind: typeof mod.kind === "string" ? mod.kind : undefined,
    });
  }

  const visibility =
    row.listingVisibility === "public" || row.listingVisibility === "private"
      ? row.listingVisibility
      : undefined;

  const rulesRaw = Array.isArray(row.rules) ? row.rules : [];
  const rules: string[] = [];
  for (const item of rulesRaw) {
    if (typeof item === "string" && item.trim()) {
      rules.push(item.trim());
      continue;
    }
    const rec = asRecord(item);
    const text =
      (typeof rec.text === "string" && rec.text.trim()) ||
      (typeof rec.rule === "string" && rec.rule.trim()) ||
      (typeof rec.body === "string" && rec.body.trim()) ||
      "";
    if (text) rules.push(text);
  }

  return {
    agentId,
    name,
    slug,
    description: typeof row.description === "string" ? row.description : undefined,
    tagline: typeof row.tagline === "string" ? row.tagline : undefined,
    iconKey: typeof row.iconKey === "string" ? row.iconKey : undefined,
    listingVisibility: visibility,
    creatorUsername,
    creatorUserId,
    deploymentId,
    versionId: typeof row.versionId === "string" ? row.versionId : undefined,
    publishedAt: typeof row.publishedAt === "string" ? row.publishedAt : undefined,
    avgRating: typeof row.avgRating === "number" ? row.avgRating : null,
    reviewCount: typeof row.reviewCount === "number" ? row.reviewCount : 0,
    modules,
    role: typeof row.role === "string" && row.role.trim() ? row.role.trim() : undefined,
    goal: typeof row.goal === "string" && row.goal.trim() ? row.goal.trim() : undefined,
    instructions:
      typeof row.instructions === "string" && row.instructions.trim()
        ? row.instructions.trim()
        : undefined,
    rules: rules.length > 0 ? rules : undefined,
  };
}

export async function resolvePublishedAgentAction(
  username: string,
  agentSlug: string,
): Promise<PublicAgentDto | null> {
  const supabase = await requireSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending supabase codegen
  const { data, error } = await (supabase as any).rpc("resolve_published_agent", {
    p_username: username,
    p_agent_slug: agentSlug,
  });
  if (error) throw error;
  return mapPublicAgent(data);
}

export type PublicAgentAudienceState = {
  favorited: boolean;
  subscribed: boolean;
  needsAccess: boolean;
  accessStatus: "none" | "pending" | "approved" | "denied";
  isOwner: boolean;
  installationId: string | null;
};

/** Landing-safe audience state — never auto-installs. */
export async function getPublishedAgentAudienceAction(
  username: string,
  agentSlug: string,
): Promise<PublicAgentAudienceState> {
  const agent = await resolvePublishedAgentAction(username, agentSlug);
  if (!agent) throw new Error("not_found");

  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      favorited: false,
      subscribed: false,
      needsAccess: agent.listingVisibility === "private",
      accessStatus: "none",
      isOwner: false,
      installationId: null,
    };
  }

  const isOwner = agent.creatorUserId === user.id;
  const visibility = agent.listingVisibility === "public" ? "public" : "private";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending supabase codegen
  const favorites = (supabase as any).from("agent_favorites");
  const { data: fav } = await favorites
    .select("agent_id")
    .eq("user_id", user.id)
    .eq("agent_id", agent.agentId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending supabase codegen
  const installations = (supabase as any).from("agent_installations");
  const { data: install } = await installations
    .select("id")
    .eq("user_id", user.id)
    .eq("agent_id", agent.agentId)
    .maybeSingle();

  if (isOwner || visibility === "public") {
    return {
      favorited: Boolean(fav),
      subscribed: Boolean(install) || isOwner,
      needsAccess: false,
      accessStatus: "approved",
      isOwner,
      installationId: install ? String(install.id) : null,
    };
  }

  const { getMyAccessStatusAction } = await import("@/lib/actions/marketplace");
  const accessStatus = await getMyAccessStatusAction(agent.agentId);
  return {
    favorited: Boolean(fav),
    subscribed: Boolean(install) && accessStatus === "approved",
    needsAccess: accessStatus !== "approved",
    accessStatus,
    isOwner,
    installationId: install && accessStatus === "approved" ? String(install.id) : null,
  };
}

/** Explicit subscribe (create installation) — requires auth. */
export async function subscribePublishedAgentAction(
  username: string,
  agentSlug: string,
): Promise<PublicAgentAudienceState> {
  const opened = await openMarketplaceAgentAction(username, agentSlug);
  if (opened.needsAccess) {
    return {
      favorited: false,
      subscribed: false,
      needsAccess: true,
      accessStatus: opened.accessStatus,
      isOwner: opened.isOwner,
      installationId: null,
    };
  }

  const installation =
    opened.installationId != null
      ? { id: opened.installationId }
      : await getOrCreateInstallation(opened.agentId);

  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending supabase codegen
  const favorites = (supabase as any).from("agent_favorites");
  const { data: fav } = await favorites
    .select("agent_id")
    .eq("user_id", user.id)
    .eq("agent_id", opened.agentId)
    .maybeSingle();

  return {
    favorited: Boolean(fav),
    subscribed: true,
    needsAccess: false,
    accessStatus: "approved",
    isOwner: opened.isOwner,
    installationId: String(installation.id),
  };
}

export async function openPublishedAgentAction(
  username: string,
  agentSlug: string,
): Promise<{
  agent: PublicAgentDto;
  installationId: string | null;
  favorited: boolean;
  needsAccess: boolean;
  accessStatus: "none" | "pending" | "approved" | "denied";
  isOwner: boolean;
}> {
  const agent = await resolvePublishedAgentAction(username, agentSlug);
  if (!agent) throw new Error("not_found");

  const opened = await openMarketplaceAgentAction(username, agentSlug);
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending supabase codegen
  const favorites = (supabase as any).from("agent_favorites");
  const { data: fav } = await favorites
    .select("agent_id")
    .eq("user_id", user.id)
    .eq("agent_id", agent.agentId)
    .maybeSingle();

  return {
    agent,
    installationId: opened.installationId ?? null,
    favorited: Boolean(fav),
    needsAccess: opened.needsAccess,
    accessStatus: opened.accessStatus,
    isOwner: opened.isOwner,
  };
}

export async function toggleFavoriteAction(
  agentId: string,
  favorited: boolean,
): Promise<{ favorited: boolean }> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending supabase codegen
  const favorites = (supabase as any).from("agent_favorites");

  if (favorited) {
    const { error } = await favorites.delete().eq("user_id", user.id).eq("agent_id", agentId);
    if (error) throw error;
    return { favorited: false };
  }

  const { error } = await favorites.insert({ user_id: user.id, agent_id: agentId });
  if (error) throw error;
  return { favorited: true };
}

export interface MyAgentCard {
  agentId: string;
  name: string;
  status: string;
  creatorUsername?: string;
  slug?: string;
  isOwner: boolean;
  publicPath?: string;
}

export async function listMyAgentsAction(): Promise<{
  created: MyAgentCard[];
  using: MyAgentCard[];
  favorites: MyAgentCard[];
}> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const myUsername =
    profile && "username" in profile && typeof profile.username === "string"
      ? profile.username
      : undefined;

  const { data: owned } = await supabase
    .from("agents")
    .select("id, name, status, slug")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const created: MyAgentCard[] = (owned ?? []).map((row) => ({
    agentId: row.id,
    name: row.name,
    status: row.status,
    creatorUsername: myUsername,
    slug: row.slug,
    isOwner: true,
    publicPath:
      myUsername && row.status === "published" ? `/@${myUsername}/${row.slug}` : undefined,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending supabase codegen
  const installations = (supabase as any).from("agent_installations");
  const { data: installs } = await installations
    .select("agent_id, status")
    .eq("user_id", user.id);

  const installAgentIds = (installs ?? [])
    .map((row: { agent_id?: string }) => row.agent_id)
    .filter((id: string | undefined): id is string => Boolean(id));

  const using: MyAgentCard[] = [];
  if (installAgentIds.length > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, status, slug, user_id")
      .in("id", installAgentIds)
      .is("deleted_at", null);

    const ownerIds = Array.from(
      new Set((agents ?? []).map((a) => a.user_id).filter((id) => id !== user.id)),
    );
    const usernameByOwner = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ownerIds);
      for (const owner of owners ?? []) {
        if ("username" in owner && typeof owner.username === "string" && owner.username) {
          usernameByOwner.set(owner.id, owner.username);
        }
      }
    }

    for (const agent of agents ?? []) {
      if (agent.user_id === user.id) continue;
      const creatorUsername = usernameByOwner.get(agent.user_id);
      using.push({
        agentId: agent.id,
        name: agent.name,
        status: agent.status,
        creatorUsername,
        slug: agent.slug,
        isOwner: false,
        publicPath:
          creatorUsername && agent.status === "published"
            ? `/@${creatorUsername}/${agent.slug}`
            : undefined,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pending supabase codegen
  const favoritesTable = (supabase as any).from("agent_favorites");
  const { data: favRows } = await favoritesTable
    .select("agent_id")
    .eq("user_id", user.id);
  const favIds = (favRows ?? [])
    .map((row: { agent_id?: string }) => row.agent_id)
    .filter((id: string | undefined): id is string => Boolean(id));

  const favorites: MyAgentCard[] = [];
  if (favIds.length > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, status, slug, user_id")
      .in("id", favIds)
      .is("deleted_at", null);
    const ownerIds = Array.from(new Set((agents ?? []).map((a) => a.user_id)));
    const usernameByOwner = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: owners } = await supabase.from("profiles").select("*").in("id", ownerIds);
      for (const owner of owners ?? []) {
        if ("username" in owner && typeof owner.username === "string" && owner.username) {
          usernameByOwner.set(owner.id, owner.username);
        }
      }
    }
    for (const agent of agents ?? []) {
      const creatorUsername = usernameByOwner.get(agent.user_id);
      favorites.push({
        agentId: agent.id,
        name: agent.name,
        status: agent.status,
        creatorUsername,
        slug: agent.slug,
        isOwner: agent.user_id === user.id,
        publicPath:
          creatorUsername && agent.status === "published"
            ? `/@${creatorUsername}/${agent.slug}`
            : undefined,
      });
    }
  }

  return { created, using, favorites };
}
