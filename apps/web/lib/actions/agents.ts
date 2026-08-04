"use server";

import { requireSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Duplicates an agent (agent row + latest version + fresh builder thread).
 * Runs entirely in the caller's RLS context: only owned agents are reachable
 * and the copy is always owned by the caller.
 */
export async function duplicateAgentAction(agentId: string): Promise<{ agentId: string }> {
  const supabase = await requireSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data: source } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (!source) throw new Error("agent_not_found");

  // Unique active slug for the copy.
  const baseSlug = `${source.slug}-copy`;
  let slug = baseSlug;
  for (let suffix = 2; ; suffix++) {
    const { data: existing } = await supabase
      .from("agents")
      .select("id")
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${suffix}`;
  }

  const { data: copy, error: copyError } = await supabase
    .from("agents")
    .insert({
      user_id: user.id,
      name: `${source.name} (copy)`,
      slug,
      description: source.description,
      icon_key: source.icon_key,
      status: "draft",
    })
    .select("id")
    .single();
  if (copyError || !copy) throw copyError ?? new Error("duplicate_failed");

  const { data: sourceVersion } = await supabase
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sourceVersion) {
    const { data: version } = await supabase
      .from("agent_versions")
      .insert({
        agent_id: copy.id,
        version_number: 1,
        spec: sourceVersion.spec,
        change_summary: "Duplicated from existing agent",
        source_prompt: sourceVersion.source_prompt,
        validation_status: sourceVersion.validation_status,
        test_status: sourceVersion.test_status,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (version) {
      await supabase.from("agents").update({ draft_version_id: version.id }).eq("id", copy.id);
    }
  }

  await supabase.from("builder_threads").insert({ agent_id: copy.id, user_id: user.id });
  await supabase.from("live_threads").insert({ agent_id: copy.id, user_id: user.id });

  return { agentId: copy.id };
}
