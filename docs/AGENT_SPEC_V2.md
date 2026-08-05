# AgentSpec V2

`schema_version: "2.0"`

Top-level fields: `identity`, `goal`, `instructions`, `model_policy`, `input_config`, `tools`, `knowledge`, `memory`, `rules`, `output`, `starter_prompts`, `graph`, `runtime`, `security`.

Legacy V1 / Phase 2 skeletons are loaded via `migrate_v1_to_v2()` and marked `schema_compat` on `agent_versions`.

Patches use optimistic concurrency (`base_version_id`) — see `AgentSpecPatch` in Python models.
