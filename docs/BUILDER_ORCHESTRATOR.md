# Builder Orchestrator

## Flow

```mermaid
flowchart TD
  receive[receive_request] --> security[input_security_check]
  security --> intent[classify_intent]
  intent --> complexity{complexity}
  complexity -->|fast| patch[simple_patch]
  complexity -->|standard_heavy| identity{needs_identity}
  identity -->|yes| form[identity_interrupt]
  form --> resume[resume_with_identity]
  identity -->|no| plan[create_plan]
  resume --> plan
  plan --> spec[generate_spec_graph]
  patch --> validate
  spec --> validate[validate_and_compile]
  validate --> test[smoke_tests]
  test --> repair{failed_and_attempts_lt_2}
  repair -->|yes| repairNode[repair_minimal_patch]
  repairNode --> test
  repair -->|no| persist[persist_version]
  persist --> done[finalize_response]
```

## Identity interrupt

1. Builder emits assistant message with `ui_component.type = agent_identity_form`.
2. Run stores interrupt in `runs.input.interrupt`.
3. User submits `POST /v1/builder/runs/{run_id}/identity`.
4. Ownership revalidated; agent renamed; build continues.

## Paths

- **Fast**: rename / tone / single rule — one structured update + validate
- **Standard**: tools/memory/behavior changes
- **Heavy**: first creation, branching, multi-tool — specialists + ≤2 repairs
