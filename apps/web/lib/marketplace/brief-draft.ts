import type { Json } from "@/lib/supabase/database.types";
import type { requireSupabaseServerClient } from "@/lib/supabase/server";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function patchSpecBrief(
  raw: Record<string, unknown>,
  fields: {
    name: string;
    role: string;
    goal: string;
    instructions: string;
    rules: string[];
  },
): Record<string, unknown> {
  const identity = asRecord(raw.identity);
  const nextInstructions =
    raw.instructions !== null &&
    typeof raw.instructions === "object" &&
    !Array.isArray(raw.instructions)
      ? {
          ...asRecord(raw.instructions),
          system: fields.instructions,
          behavioral_rules: fields.rules,
        }
      : {
          system: fields.instructions,
          tone: "professional",
          language: "auto",
          behavioral_rules: fields.rules,
        };

  return {
    ...raw,
    name: fields.name,
    goal: fields.goal,
    identity: {
      ...identity,
      name: fields.name,
      role: fields.role,
    },
    instructions: nextInstructions,
    rules: fields.rules.map((text, index) => ({ id: `settings_${index + 1}`, text, priority: 100 })),
  };
}

export async function createOwnedAgentBriefDraft(
  supabase: Awaited<ReturnType<typeof requireSupabaseServerClient>>,
  agent: {
    id: string;
    draft_version_id?: string | null;
    published_version_id?: string | null;
  },
  userId: string,
  fields: { name: string; role: string; goal: string; instructions: string; rules: string[] },
): Promise<string | null> {
  const versionId = agent.draft_version_id || agent.published_version_id;
  if (!versionId) return null;
  const { data: version, error } = await supabase
    .from("agent_versions")
    .select("spec, graph_spec, schema_compat")
    .eq("agent_id", agent.id)
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  if (!version) throw new Error("draft_version_missing");
  const nextSpec = patchSpecBrief(asRecord(version.spec), fields);
  if (JSON.stringify(nextSpec) === JSON.stringify(version.spec)) return versionId;
  // Versions are immutable for authenticated users. Create a draft instead of
  // updating either the existing draft or the agent's published snapshot.
  const { data: latest, error: latestError } = await supabase
    .from("agent_versions")
    .select("version_number")
    .eq("agent_id", agent.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  const { data: created, error: createError } = await supabase
    .from("agent_versions")
    .insert({
      agent_id: agent.id,
      created_by: userId,
      version_number: (latest?.version_number ?? 0) + 1,
      spec: nextSpec as Json,
      graph_spec: version.graph_spec,
      schema_compat: version.schema_compat,
      change_summary: "Updated identity and instructions in Settings",
      validation_status: "pending",
      test_status: "not_run",
    })
    .select("id")
    .single();
  if (createError) throw createError;
  if (!created?.id) throw new Error("draft_version_not_created");
  return created.id;
}
