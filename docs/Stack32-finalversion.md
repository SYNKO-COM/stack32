# STACK32 — FINAL MVP PRODUCTION HARDENING, BUILDER UX REFACTOR, GENERATED-AGENT RUNTIME SIMPLIFICATION, MEMORY, BYOK LLM, SCHEDULER, VERIFICATION, INTEGRATIONS, CI AND RELEASE GATE

Repository:
https://github.com/SYNKO-COM/stack32.git

Expected baseline when this task was prepared:
main @ 7271a0370cc06ca400e9c00d6a995a2ad6b66f39

IMPORTANT:
Do NOT blindly assume that commit is still HEAD when you begin.
First fetch / inspect the actual latest main branch and work from the real current repository state.

This is a FINAL MVP PRODUCTION-HARDENING task.

Stack32 is already substantially implemented.
DO NOT restart the architecture.
DO NOT rebuild working systems from scratch.
DO NOT replace robust existing systems merely because another architecture looks cleaner.
Audit first, preserve what is solid, repair what is incomplete, and finish the product.

The objective is that after this program is implemented and validated, Stack32 can be opened to its first real users and the generated AI agents actually work.

============================================================
0. OPERATING MODE — READ THIS FIRST
============================================================

You are currently in PLAN MODE.

PHASE A — PLAN MODE:
Do NOT modify files yet.
Do NOT create migrations yet.
Do NOT commit anything yet.

First:
1. Read this entire prompt.
2. Pull / inspect latest main.
3. Audit the current implementation against every requirement below.
4. Reproduce the known failures where possible.
5. Research official documentation where implementation details are uncertain or provider APIs have changed.
6. Produce a dependency-ordered implementation plan.
7. Identify what already works and MUST NOT be rewritten.
8. Identify exact files, tables, migrations, APIs, components and tests that must change.
9. Identify any external configuration / credentials the project owner will eventually need to provide.

After the plan is approved, switch to implementation and work milestone by milestone.

During implementation:
- implement, do not merely document;
- test each milestone before continuing;
- do not leave fake production paths;
- do not silently downgrade required functionality to mocks;
- do not mark something complete until its tests prove it;
- when an external credential is genuinely required, implement everything possible first and clearly state the exact missing configuration.

You MAY and SHOULD research current official documentation when required.

For technical implementation questions:
prefer PRIMARY SOURCES:
- provider documentation,
- official SDK documentation,
- official GitHub repositories/releases,
- framework documentation.

Do not copy random tutorials when official documentation exists.

============================================================
1. CORE PRODUCT PRINCIPLE
============================================================

Stack32 is:

"Cursor / Claude Code specialized in building AI agents."

There are TWO DIFFERENT AGENTS and they must never be confused.

------------------------------------------------------------
A. STACK32 BUILDER
------------------------------------------------------------

Stack32 Builder is OUR coding/building agent.

It:
- understands the user's request;
- asks clarifying questions;
- creates/configures generated AI agents;
- creates real agent project/code/spec/runtime configuration;
- chooses required capabilities;
- resolves tools;
- tests the generated agent;
- diagnoses errors;
- repairs its work;
- verifies readiness;
- publishes/updates the agent.

Stack32 Builder uses Stack32's own platform LLM infrastructure/credentials.

------------------------------------------------------------
B. GENERATED USER AGENT
------------------------------------------------------------

This is the final agent Stack32 creates for the customer.

It:
- has its own instructions;
- has its own selected LLM;
- has its own user-provided LLM credential;
- has its own memory configuration;
- has its own tools;
- has its own connections;
- has its own triggers;
- runs independently of the Builder.

CRITICAL SECURITY / BILLING RULE:

A generated user agent MUST NEVER silently use Stack32's platform LLM API key.

Generated agent:
    user's chosen provider
    +
    user's exact chosen model
    +
    user's agent-scoped credential

Stack32 Builder:
    Stack32 platform credentials

Keep this separation explicit throughout the code.

============================================================
2. FINAL MVP GENERATED-AGENT MENTAL MODEL
============================================================

We are deliberately simplifying the MVP.

DO NOT turn Stack32 into n8n.

A generated Stack32 agent only needs:

    INPUT / TRIGGER
          ↓
       AI AGENT
      /    |    \
   Model Memory Tools
          ↓
        OUTPUT

For the MVP there are ONLY TWO trigger types exposed to users:

1. CHAT
2. SCHEDULE

An agent can support:
- Chat only;
- Schedule only;
- both Chat and Schedule.

REMOVE / HIDE FROM THE MVP PRODUCT SURFACE:
- webhook trigger;
- app-event trigger;
- form-submission trigger;
- manual workflow trigger;
- called-by-another-workflow;
- file-change trigger;
- generic n8n-style trigger marketplace;
- any other trigger not required by Chat or Schedule.

Backward compatibility with old persisted specs is still required.
Do not corrupt old agents.
If legacy `manual` or `webhook` values exist, migrate/normalize safely.

The conceptual product structure should be:

    [ Chat ] ------\
                     \
                      [ AI Agent ] ------ [ Output ]
                     /
    [ Schedule ] ---/

Under AI Agent:

    AI Agent
       │
       ├── Model
       ├── Memory
       ├── Gmail
       ├── Slack
       ├── HubSpot
       ├── Calendar
       └── any other REAL external user-facing tool

Not every attachment exists on every agent.

============================================================
3. OUTPUT SEMANTICS
============================================================

For a Chat-triggered execution:

User:
"Add this lead to HubSpot and draft the follow-up."

Agent:
- reasons operationally;
- invokes necessary tools;
- receives observations;
- continues if needed;
- verifies completion;
- gives a final chat message.

Example final response:

"Done. I added the lead to HubSpot and prepared the follow-up."

The final textual response belongs in Stack32.

For a scheduled run:
- the run starts automatically;
- the agent performs its configured scheduled objective;
- all operations belong to a persisted Stack32 run;
- a visible result/history is recorded;
- the terminal result can optionally generate an email notification.

NEVER report a tool action as successful unless an actual tool result confirms success.

No hallucinated "Done".

============================================================
4. STRUCTURE TAB — FINAL SIMPLIFIED PRODUCT VIEW
============================================================

The current Structure implementation has moved in the right direction.
PRESERVE the robust React Flow / graph foundations.

But simplify the PRODUCT representation.

Show:

Trigger(s)
    ↓
AI Agent
    ↓
Output

with AI Agent attachments:
- exact Model;
- Memory;
- knowledge ONLY when actually used;
- real external tools.

Examples:

CHAT-ONLY:

[ Chat ] → [ AI Agent ] → [ Output ]
                │
                ├ Model
                ├ Memory
                ├ Gmail
                └ HubSpot


CHAT + SCHEDULE:

[ Chat ] ------\
                → [ AI Agent ] → [ Output ]
[ Schedule ] --/        │
                        ├ Model
                        ├ Memory
                        ├ Slack
                        └ Calendar


SCHEDULE-ONLY:

[ Schedule ] → [ AI Agent ] → [ Output ]
                    │
                    ├ Model
                    ├ Memory
                    └ CRM

INTERNAL IMPLEMENTATION DETAILS MUST NOT CLUTTER STRUCTURE.

Do not show as product nodes:
- current_datetime;
- calculator;
- fetch_url;
- web_search if it is merely an internal supporting capability;
- structured_output;
- internal guardrails;
- internal routers;
- transforms;
- orchestration helper nodes;
- internal memory read/write pair separately;
- internal approval mechanics;
- validator nodes;
- repair nodes;
- framework plumbing.

They may continue to exist internally.

Structure must represent the USER'S AGENT, not expose Stack32 runtime implementation noise.

Memory should appear as ONE Memory attachment.

Model must display the EXACT selected model, not merely "balanced" / "reasoning".

Schedule node should show a human-readable schedule summary when selected.

Tool status should still make it obvious when setup is incomplete.

============================================================
5. REMOVE THE OBSOLETE EARLY GOOGLE QUESTION
============================================================

There is currently an obsolete Builder behavior.

The Builder analyzes words such as:
- email;
- gmail;
- mail;
- inbox;
- calendar;
- meeting;
- agenda;
etc.

and may create an early `connection_intent` question such as:

"Does it need an external account?"
"Google now / later?"

REMOVE THIS FROM THE INITIAL SETUP FLOW.

Specifically audit the logic around:
`_analyze_dynamic_questions()`

and remove the obsolete early:
`connection_intent`
`none/google/later`
flow.

WHY:

At this stage Stack32 does not yet know the precise tool/provider.

"Send email" does not necessarily mean Gmail.
It might be:
- Gmail;
- Outlook;
- another provider.

"CRM" might be:
- HubSpot;
- Salesforce;
- Pipedrive;
- etc.

Connections must happen AFTER Stack32 has designed the agent and resolved its actual tool requirements.

Do NOT remove all useful clarification logic.
Remove only this premature provider/account connection behavior.

============================================================
6. FINAL INITIAL BUILDER FLOW
============================================================

The first build must follow this product flow.

------------------------------------------------------------
STEP 1 — USER PROMPT
------------------------------------------------------------

Example:

"Create an agent that researches a company, scores the lead and drafts a personalized email."

Persist it and start setup.

------------------------------------------------------------
STEP 2 — IDENTITY
------------------------------------------------------------

Form:

Agent name
What it does / mission / role
Tone
Short description

Use intelligent suggestions from the prompt.

Submit.

Then immediately visually acknowledge:

✓ Identity saved

No dead period.

------------------------------------------------------------
STEP 3 — BEHAVIOR
------------------------------------------------------------

Do NOT use the current generic capabilities form.

Replace it with a focused MVP Behavior form.

A. TRIGGERS

"How should this agent run?"

Checkbox:
[✓] Chat
    Run the agent when you message it.

Checkbox:
[ ] Schedule
    Run automatically on a schedule.

At least one must be selected.

Both can be selected.

If Schedule is selected:
display schedule configuration inline or as the immediate next sub-step.

DO NOT reduce scheduling to "every hour".

Support a simple user-friendly recurrence UI.

For MVP, useful presets can include:
- every hour;
- every N hours;
- daily at a time;
- weekdays at a time;
- weekly on selected day/time;
- advanced/custom if implementation already supports it safely.

Persist canonical schedule data and an IANA timezone.

B. MEMORY

"How should this agent remember things?"

ONLY TWO PRODUCT OPTIONS:

1. Stack32 Memory
   Recommended

Description:
"Remembers recent conversations, important information and previous tasks automatically."

2. External Memory
   Advanced

Description:
"Store agent memory in your own PostgreSQL / Supabase database."

Do NOT expose:
- Redis;
- Zep;
- Motorhead;
- Xata;
- Window Buffer;
- Postgres Chat Memory;
- framework names;
- implementation-level memory choices.

C. REMOVE UNIVERSAL DOCUMENT OPTION

Do NOT ask:
"Documents / Knowledge base?"

during every initial agent creation.

Knowledge/RAG must be requested dynamically only if the user's request actually requires it.

Examples requiring it:
"Answer questions from our employee handbook."
"Use these PDF policies."
"Search my knowledge base."

Generic CRM/email agents should never be forced through a Documents question.

------------------------------------------------------------
STEP 4 — BRAIN / LLM — MANDATORY
------------------------------------------------------------

This is REQUIRED before Build.

Display a clear step:

"Choose the brain for your agent."

Fields:

Provider
[ OpenAI ▼ ]

Exact Model
[ exact model identifier / friendly label ▼ ]

API key / credential
[ ••••••••••••••• ]

[Test connection]

Validation result:
✓ API key valid
✓ Model accessible

Only after successful validation can this step complete.

Then:
[ Continue ]

The API key must belong to the GENERATED AGENT.
It must not become the Builder credential.

------------------------------------------------------------
STEP 5 — BUILD MY AGENT
------------------------------------------------------------

Only now show:

[ Build my agent ]

After this:
Stack32 Builder starts the actual build.

============================================================
7. BUILDER INITIAL CONFIGURATION STATE MACHINE
============================================================

The current UX can enter confusing silent states between forms.

Fix this properly.

Do NOT add random timeouts as the primary solution.

Implement a deterministic Builder setup state machine.

Conceptually, states should be equivalent to:

initial_prompt
identity_required
identity_submitting
behavior_required
behavior_submitting
external_memory_setup_required   (conditional)
llm_required
llm_validating
ready_to_build
building
clarification_required
connections_required
tool_configuration_required
verifying
repairing
ready
failed
canceled

You may adapt names to current architecture.

But there must be ONE canonical source of truth for what the Builder is doing.

The UI should know the difference between:
- backend actively working;
- waiting for required form input;
- waiting for OAuth;
- validating;
- terminal success;
- terminal failure.

============================================================
8. FIX THE "SILENCE AFTER FORM SUBMIT" BUG
============================================================

Current behavior can be:

user submits Identity
→ form disappears
→ nothing visible
→ backend continues
→ user thinks it froze
→ user can attempt another prompt
→ eventual next messages appear later

THIS IS NOT ACCEPTABLE.

Immediately after any setup form submit:

1. lock that form;
2. mark it resolved;
3. show a visible operational activity state;
4. keep polling/subscribing to current run;
5. disable free-form composer while Builder owns the turn;
6. transition to next form when server requests input.

Example:

✓ Identity saved

◌ Configuring your agent...

then:

✓ Understanding your requirements
◌ Preparing memory and trigger settings...

then next form.

NO PAGE REFRESH SHOULD EVER BE REQUIRED.

Investigate the current pattern where components call local:
`setCompleted(true)`
before the server transition is fully visible.

Do not solve this by keeping old forms visible forever.
Solve the transition state architecture.

============================================================
9. COMPOSER LOCKING
============================================================

During INITIAL SETUP:

When Builder is actively working:
composer = disabled

When required setup form is visible:
composer = disabled

When LLM validation is running:
composer = disabled

When OAuth connection modal/window is in an exclusive setup step:
composer should not allow an unrelated new build turn.

When the Builder genuinely asks a free-text clarification question:
enable the appropriate answer UI, which may be:
- dedicated structured form;
- or composer if a natural-language answer is appropriate.

Once initial creation has finished / enters normal Build chat:
composer becomes available normally.

Prevent:
- double submissions;
- duplicate builder runs;
- racing responses;
- stale form submissions;
- user sending a second initial prompt while first setup is unresolved.

Preserve the existing Stop capability.

Stop must:
- cancel/stop current Builder work;
- immediately make UI state coherent;
- not leave stale "Thinking..." forever;
- not permit the canceled worker to later overwrite the UI as Ready.

============================================================
10. BUILDER LIVE ACTIVITY
============================================================

Existing real activity/event functionality should be preserved and strengthened.

Activity must work during setup too.

Examples of safe operational activity:

"Saving agent identity"
"Preparing behavior settings"
"Validating OpenAI credential"
"Creating agent project"
"Reading agent.yaml"
"Updating runtime configuration"
"Resolving required tools"
"Checking Gmail connection"
"Running build"
"Running verification"
"Repairing configuration"
"Retesting"

Never display private chain-of-thought.

Never fake events.

If the Builder didn't read a file, don't say it read a file.
If no test ran, don't claim a test ran.

Expose ACTIONS, STATUS and RESULTS — not hidden reasoning.

Historical messages must NOT replay their typewriter animation on refresh.

Fresh assistant messages should reveal sequentially, one assistant bubble at a time, not all concurrently.

============================================================
11. STACK32 MEMORY — RECOMMENDED
============================================================

Implement Stack32 Memory as the default zero-configuration memory provider.

It should provide:

A. RECENT CONVERSATION CONTEXT
- recent relevant messages;
- token-budgeted;
- never append the entire lifetime history forever.

B. ROLLING CONVERSATION SUMMARY
- compact older context;
- update after sensible thresholds;
- avoid summarizing every single message if unnecessary.

C. LONG-TERM MEMORY
Important:
- user preferences;
- stable facts;
- explicit instructions;
- useful task results.

D. RETENTION
Actually enforce:
- retention_days;
- expires_at;
- max_memory_items.

The existing config fields must no longer be decorative.

E. CLEANUP
Implement scheduled/background cleanup:
- delete expired memory;
- enforce maximum items;
- compact/dedupe where appropriate;
- avoid unbounded conversation growth.

F. SCALE
Design for at least several thousand active users / agents without:
- reading whole histories;
- scanning huge tables unnecessarily;
- opening unbounded DB connections;
- embedding everything every turn;
- creating unlimited duplicate memory records.

Use indexes appropriately.

Avoid premature distributed complexity but make data access bounded.

G. SECURITY
Never store:
- API keys;
- passwords;
- OAuth tokens;
- obvious credentials;
as agent memories.

Existing secret filtering should remain and be hardened where sensible.

============================================================
12. EXTERNAL MEMORY — ADVANCED
============================================================

For MVP, support:

POSTGRESQL
including Supabase PostgreSQL.

DO NOT route every memory read/write through Pipedream.

Memory is a high-frequency core runtime system.
Implement a native provider abstraction.

Suggested interface:

MemoryProvider

Implementations:
- Stack32MemoryProvider
- PostgresMemoryProvider

Supabase should use PostgresMemoryProvider because Supabase exposes PostgreSQL.

Do not create 10 provider implementations.

------------------------------------------------------------
EXTERNAL MEMORY USER FLOW
------------------------------------------------------------

If External Memory is selected:

Show:

Database type
[ PostgreSQL / Supabase ]

Connection string
[ encrypted secret input ]

Example helper copy:
"For Supabase, open your project → Connect → copy your PostgreSQL connection string."

[Test connection]

Then test:
- DNS/network;
- TLS/SSL where appropriate;
- authentication;
- database reachable;
- required permissions.

Only save after successful validation.

Never send connection strings to an LLM.

Store them encrypted server-side and scoped to the agent.

Do not store them in:
- browser localStorage;
- React props longer than necessary;
- logs;
- analytics;
- agent spec plaintext;
- chat messages.

------------------------------------------------------------
SUPABASE / POSTGRES NETWORKING
------------------------------------------------------------

Research current official Supabase Postgres connection recommendations before implementing.

Account for:
- Direct connection;
- Supavisor session pooler;
- transaction pooler;
- IPv4 / IPv6 constraints;
- transaction-mode prepared statement limitations.

Do not blindly assume all Stack32 production infrastructure supports Supabase's direct IPv6 endpoint.

Choose the connection mode appropriate for Stack32 runtime architecture.

------------------------------------------------------------
MEMORY DATABASE SCHEMA
------------------------------------------------------------

When using external Postgres/Supabase:

Do not interfere with user's existing tables.

Use a clearly namespaced schema/table strategy such as:

stack32_memory

or equivalently isolated tables.

Before creating schema/tables:
- verify permissions;
- make operation idempotent;
- explain to user what will be created;
- fail clearly if DB user lacks CREATE permission.

Alternative:
if permissions only allow existing schema/table, support an explicitly configured namespace/table only if required by product design.

At minimum implement a reliable default.

------------------------------------------------------------
CONNECTION MANAGEMENT
------------------------------------------------------------

Do not maintain thousands of permanently open pools.

Use:
- bounded connection lifetime;
- conservative pooling;
- lazy initialization;
- idle eviction;
- connection timeout;
- safe concurrency limits;
- circuit breaker/backoff on failed database;
- no credential leakage.

============================================================
13. LLM MODEL CONFIGURATION — FIX THE CURRENT ARCHITECTURE
============================================================

Current generated-agent model config is too abstract.

`fast`
`balanced`
`reasoning`

may remain useful for STACK32 BUILDER routing, but generated user agents need an EXACT model.

Introduce / migrate to a generated-agent model configuration containing at least:

provider
model_id
credential_reference or securely resolvable secret scope
fallback_enabled
optional metadata/capabilities

For example conceptually:

{
  "provider": "openai",
  "model_id": "EXACT_PROVIDER_MODEL_ID",
  "credential_scope": "agent",
  "fallback_enabled": false
}

DO NOT put the raw API key in AgentSpec.

For MVP:
fallback should normally be OFF unless deliberately supported/configured.

Why?
If a user selected a specific paid provider/model, Stack32 must not unexpectedly execute another model with platform credentials.

============================================================
14. PROVIDERS TO SUPPORT
============================================================

Audit current support and preserve working providers:

- OpenAI
- Anthropic
- Google Gemini
- xAI / Grok
- Mistral
- Groq
- OpenRouter

Before final implementation, check current OFFICIAL API documentation for:
- authentication method;
- base URL / SDK semantics;
- model listing API if available;
- currently supported model identifiers;
- safe credential validation mechanism;
- tool/function calling capabilities where relevant.

Do NOT rely forever on stale hardcoded model IDs.

Prefer:

ProviderAdapter
    list_models()
    validate_credentials()
    validate_model_access()
    normalize_error()
    create_completion(...)

or an equivalent clean architecture.

A cached model catalog is acceptable.

A curated fallback model list can exist for provider outages or unsupported model-list APIs, but must be explicit and maintained.

============================================================
15. API KEY VALIDATION — FIX ERROR CLASSIFICATION
============================================================

Current validation incorrectly risks turning nearly every provider exception into:

INVALID_LLM_KEY

Fix this.

Normalize at least:

INVALID_AUTH
MODEL_NOT_FOUND
MODEL_ACCESS_DENIED
QUOTA_EXCEEDED
BILLING_REQUIRED
RATE_LIMITED
PROVIDER_TIMEOUT
PROVIDER_UNAVAILABLE
MALFORMED_CREDENTIAL
UNKNOWN_PROVIDER_ERROR

User-facing examples:

"That API key is invalid."

"The key is valid, but it doesn't have access to this model."

"The provider rejected the request because the account has no available quota."

"The provider is temporarily unavailable. Your key has not been marked invalid."

"Validation timed out. Try again."

Do not destroy an existing working key because one temporary validation request timed out.

Use a cheap, safe validation path.

Do not spend meaningful user tokens merely to test credentials.

If the provider has a model-list/auth endpoint suitable for validation, use it.

If a minimal inference is required:
- use the smallest practical request;
- max output extremely small;
- record validation result separately.

============================================================
16. GENERATED AGENT MUST USE THE USER'S EXACT LLM
============================================================

This is P0.

On every generated-agent Live/Scheduled run:

resolve:

user_id
agent_id
    ↓
agent model configuration
    ↓
exact provider
exact model_id
    ↓
agent-scoped encrypted user credential
    ↓
provider request

Never silently fall through to Stack32 platform keys.

Add an explicit safety assertion/gate if necessary.

If generated agent credential is missing:

fail with:
LLM_CONFIGURATION_REQUIRED

not:
"try Stack32's OpenAI key".

If credential is invalid/revoked:
needs_setup / needs_attention.

============================================================
17. LLM READINESS GATE
============================================================

The existing readiness system checks many tools/connections.

Extend it so "brain" is P0.

A generated agent cannot be READY unless:

✓ model provider selected
✓ exact model selected
✓ agent-scoped LLM secret exists
✓ secret decrypts successfully
✓ latest validation succeeded
✓ selected model was accessible at validation
✓ runtime can resolve provider/model combination

Consider validation freshness.

Do not necessarily ping provider on every page load.
Persist validation status/timestamp safely.

But publish/initial Ready should have trustworthy validation.

Readiness output should clearly identify:

Brain
Memory
Trigger
Tools
Build
Verification

============================================================
18. TOOL RESOLUTION — PRESERVE CURRENT PIPEDREAM ARCHITECTURE
============================================================

The repository already contains substantial Pipedream work.

DO NOT REWRITE IT unless a specific bug requires changes.

Preserve these principles:

- Stack32 JWT user ID becomes Pipedream external user ID;
- user does not supply external_user_id manually;
- Pipedream accounts sync into Stack32 user_connections;
- agent_connection_bindings bind accounts to specific agent/tool;
- auth identifiers are resolved server-side;
- LLM cannot inject auth tokens/authProvisionId;
- static/runtime/connection props are normalized;
- JIT schemas load only for relevant tools;
- tool configuration is agent-specific;
- side effects require approval according to policy.

============================================================
19. PIPEDREAM PRODUCTION ENVIRONMENT
============================================================

Verify against current official Pipedream Connect docs while implementing.

The intended production UX is:

Stack32
→ Connect Slack
→ Slack OAuth
→ Approve
→ return to Stack32

NOT:

Stack32
→ create/login to Pipedream account
→ connect Slack

Stack32's users should not require Pipedream accounts.

Development mode may require Pipedream sign-in and has external-user limitations.
Production mode should use the Pipedream production environment.

Audit:
PIPEDREAM_ENVIRONMENT
SDK client construction
API headers
Connect token endpoints
account sync
redirects

Ensure production deployment cannot accidentally use development environment.

Prefer a startup/configuration error in production if:
PIPEDREAM_ENVIRONMENT != production

when Pipedream integrations are enabled.

Do not expose Pipedream client secret to frontend.

============================================================
20. EXACT TOOL PROVIDER CLARIFICATIONS
============================================================

After the agent is initially built and Stack32 resolves intended capabilities:

If the requested provider is ambiguous, ask.

Example user prompt:
"send emails and update my CRM"

Stack32 should identify unresolved choices:

Email provider:
- Gmail?
- Outlook?
- another supported provider?

CRM:
- HubSpot?
- Salesforce?
- Pipedrive?
- another supported provider?

Ask ALL currently known ambiguities together.

Example structured Builder message:

"Before I connect the tools, I need two details:

Email provider
[ Gmail ▼ ]

CRM
[ HubSpot ▼ ]

Continue"

Do not ask five sequential one-question interruptions when all choices were already known.

After provider choices are known:
resolve exact tools/actions.

Then connect them one-by-one.

============================================================
21. PIPEDREAM CONNECTION FLOW
============================================================

For each required app:

1. create short-lived Pipedream Connect token server-side;
2. scope it to authenticated Stack32 user;
3. production environment;
4. start OAuth/connect flow;
5. receive completion;
6. sync account;
7. create Stack32 user_connection;
8. bind exact connection to:
   user + agent + relevant tool IDs;
9. validate connection;
10. resolve required static configuration;
11. continue Builder.

Handle:
- canceled OAuth;
- popup closed;
- account already connected;
- multiple accounts for same app;
- choosing between existing accounts;
- expired token;
- revoked account;
- connection error;
- reconnect.

Never treat clicking "Connect" as success.

Only transition after the actual connection is confirmed.

============================================================
22. MULTIPLE ACCOUNTS / AGENTS
============================================================

This must work:

User:
    Slack account A
    Slack account B

Agent A:
    Slack account A

Agent B:
    Slack account B

Do not resolve "the first Slack account".

Resolve the exact agent binding.

Add integration tests.

============================================================
23. JIT TOOL SCHEMAS
============================================================

Preserve the existing JIT schema functionality.

Do not place thousands of Pipedream schemas into every LLM request.

Flow:

agent has selected tools
        ↓
load schemas only for enabled selected tools
        ↓
normalize schemas
        ↓
remove server-managed auth fields
        ↓
remove already-configured static fields
        ↓
give runtime fields to LLM

Fail readiness when an external tool schema cannot resolve.

Do not silently provide `{}` as a production schema and still mark Ready.

============================================================
24. TOOL APPROVAL / SIDE EFFECTS
============================================================

Preserve approval protection.

Read-only examples:
- search;
- list;
- read;
- retrieve;
- fetch.

Side-effect examples:
- send email;
- create CRM contact;
- post Slack message;
- create calendar event;
- update record;
- delete data;
- create invoice;
etc.

Side effects require appropriate approval according to policy.

Do not weaken security merely to make acceptance tests easier.

============================================================
25. KNOWLEDGE / DOCUMENTS
============================================================

Remove Documents from universal setup.

But DO NOT delete knowledge/RAG support.

Instead:

Builder detects when prompt needs knowledge.

Example:
"Build an agent that answers employee questions from our handbook."

Then Builder requests:
- upload/select source;
- ingestion;
- readiness.

Knowledge is a conditional capability.

Structure shows Knowledge only when enabled.

============================================================
26. PRODUCTION SCHEDULER — REPLACE THE PLACEHOLDER
============================================================

Current schedule logic is NOT sufficient.

Audit the current implementation around:
`/internal/tasks/schedules/tick`
`agent_schedules`
queue workers.

Do not retain:
"every enabled schedule fires whenever tick endpoint runs".

Implement a real scheduler.

Minimum canonical persisted fields should cover:

id
user_id
agent_id
enabled
schedule definition / cron
timezone
next_run_at
last_run_at
last_success_at if useful
failure_count
max/concurrency policy
notification preference
created_at
updated_at

Use forward-only migration(s).

============================================================
27. SCHEDULER TIMEZONE
============================================================

Use IANA timezones.

Examples:
Europe/Paris
America/New_York

Do not permanently convert user's intended "09:00 Europe/Paris" into "09:00 UTC".

Persist timezone and calculate actual next execution correctly through:
- DST transitions;
- summer/winter time;
- weekly recurrence.

Use a reliable cron/scheduling library rather than hand-parsing complicated cron if appropriate.

============================================================
28. SCHEDULER CLAIMING / IDEMPOTENCY
============================================================

Multiple workers may tick concurrently.

Prevent duplicate scheduled runs.

Implement an atomic due-schedule claim.

Use one of:
- SQL transaction + `FOR UPDATE SKIP LOCKED`;
- atomic update/RPC;
- equivalent proven Postgres mechanism.

Requirements:

Only schedules with:
next_run_at <= now()
and enabled = true
may be claimed.

When claimed:
- establish lease/claim;
- create deterministic idempotency key for occurrence;
- schedule occurrence must execute at most once under normal retry semantics;
- update next_run_at correctly;
- enqueue run;
- avoid two workers enqueuing same occurrence.

Worker crash must be recoverable.

============================================================
29. SCHEDULED RUN INPUT
============================================================

Never send merely:

"Scheduled run"

as the agent's objective.

A schedule must contain / reference a real instruction.

Example:

Schedule:
Every weekday at 09:00

Instruction:
"Review newly qualified leads, draft follow-ups and report what requires approval."

Scheduled execution receives:
- agent system instructions;
- schedule instruction;
- relevant memory/context;
- tools;
- execution metadata.

============================================================
30. SCHEDULED RUN OUTPUT
============================================================

Each scheduled execution must persist a visible run.

Create a sensible conversation/history representation.

For example:

Scheduled Run — Aug 14, 09:00

✓ Reviewed 12 leads
✓ Qualified 4
✓ Prepared 4 drafts

Run completed successfully.

The user should be able to open the generated agent and inspect scheduled executions.

Do not create invisible background actions with no audit trail.

============================================================
31. SCHEDULE EMAIL NOTIFICATION
============================================================

Add an MVP option to the Schedule settings:

[ ] Email me when a scheduled run finishes

When enabled:
after a scheduled run reaches terminal state,
send an email to the email address of the authenticated Stack32 account.

The notification may include:

Agent name
Run date/time
Status
Short result summary
Link/deep link to open the run in Stack32 if an appropriate product URL exists.

Support at least terminal success/failure notifications.

Do not email every internal tool step.

One run → one terminal notification.

============================================================
32. SMTP / APPLICATION EMAIL
============================================================

Stack32/Supabase Auth already uses SMTP configuration for authentication emails in the deployment environment.

First AUDIT current repository/environment configuration.

Do NOT assume Supabase Auth's SMTP settings are magically exposed as an application mail API.

If the backend already has reusable server-only SMTP env variables, reuse them.

Otherwise add a clean application mail configuration, for example conceptually:

SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM_EMAIL
SMTP_FROM_NAME
SMTP_USE_TLS

Use the same IONOS mailbox/server configuration family if that is the existing production setup.

Never:
- hardcode password;
- commit credentials;
- expose SMTP password to browser;
- put credentials in Supabase public tables.

Implement a Mailer/EmailService abstraction.

Support:
- HTML;
- plain text fallback;
- timeout;
- retry/backoff;
- logging without sensitive content;
- audit event.

IMPORTANT:

If notification email delivery fails:
the scheduled AGENT RUN must remain successful if the actual agent work succeeded.

Record:
notification_failed

Do not change:
agent_run = failed

because SMTP failed.

============================================================
33. MEMORY RETENTION AND CLEANUP JOB
============================================================

Add actual enforcement for memory policy.

At write:
- expires_at based on retention policy;
- prevent unbounded items.

Periodic cleanup:
- delete expired memories;
- enforce per-agent caps;
- clean stale conversation summaries according to policy;
- avoid huge transactions.

Use batches.

Add indexes where query patterns require them.

Make cleanup idempotent.

This should be able to operate with several thousand users without full-table scans on every agent message.

============================================================
34. CONVERSATION CONTEXT BUDGETING
============================================================

Generated agents need reliable memory without exploding LLM costs.

Implement a context builder.

Conceptually:

system instructions
+
relevant recent conversation
+
rolling summary
+
selected long-term memories
+
current user message
+
tool observations

must fit within provider/model context budget.

Do not send:
the entire lifetime chat history.

Reserve tokens for:
tool observations
and
final output.

Use exact selected model's context capability if available.
Otherwise use conservative provider/model metadata.

============================================================
35. FINAL VERIFICATION PIPELINE
============================================================

After Stack32 Builder believes construction is complete, it must NOT immediately say Ready.

Run a layered verification pipeline.

------------------------------------------------------------
LEVEL 1 — STRUCTURE / BUILD
------------------------------------------------------------

Validate:
- AgentSpec;
- GraphSpec;
- generated project;
- manifest;
- code syntax;
- imports;
- tests;
- compilation/build;
- runtime initialization.

------------------------------------------------------------
LEVEL 2 — BRAIN
------------------------------------------------------------

Validate:
- provider exists;
- exact model configured;
- credential exists;
- credential decrypts;
- safe provider authentication;
- selected model accessible;
- tiny safe inference succeeds where necessary.

------------------------------------------------------------
LEVEL 3 — MEMORY
------------------------------------------------------------

Stack32 Memory:
- write a hidden test item;
- retrieve it;
- verify;
- delete it.

External memory:
- connect;
- write hidden namespaced test item;
- read;
- delete.

Never pollute user's normal memory.

------------------------------------------------------------
LEVEL 4 — CONNECTIONS / TOOL CONFIG
------------------------------------------------------------

Validate for every external enabled tool:
- provider resolves;
- schema resolves;
- connection exists;
- connection belongs to correct user;
- binding belongs to correct agent;
- required static config exists;
- auth appears healthy;
- approval policy valid.

------------------------------------------------------------
LEVEL 5 — SAFE TOOL PROBES
------------------------------------------------------------

For genuinely read-only operations:
a safe real probe may be used when appropriate.

Examples:
- list available calendars;
- list Slack channels;
- retrieve account metadata.

Be conservative.

For WRITE / SIDE-EFFECT tools:

DO NOT automatically:
- send fake email;
- create fake HubSpot lead;
- create fake calendar event;
- post fake Slack message;
- create fake Stripe transaction;
- delete records.

Instead validate:
- auth;
- schema;
- configuration;
- executor path;
- dry-run capability if provider explicitly supports it.

------------------------------------------------------------
LEVEL 6 — CONTROLLED AGENT LOOP
------------------------------------------------------------

Run a controlled agent evaluation that proves:
- model receives relevant tools;
- it can select a correct tool;
- tool call structure parses;
- observation returns to model;
- model can continue;
- final response only reports verified results.

For side effects:
use mocked/no-op execution AT THIS VERIFICATION LAYER ONLY,
or stop before mutation,
unless the product owner explicitly launched a manual acceptance test.

Do not substitute mocks for normal production execution.

============================================================
36. VERIFY → REPAIR → RETEST LOOP
============================================================

Builder should repair repairable failures automatically.

Flow:

verify
↓
error
↓
classify
↓
repair if Stack32 can repair it
↓
reverify

Normal target:
3–5 repair iterations maximum in healthy circumstances.

HARD MAXIMUM:
10 repair iterations.

Separate this Builder verification limit from normal generated-agent runtime step limits.

Add loop detection.

Fingerprint:
- error code;
- relevant stack/error signature;
- affected file/config;
- attempted repair signature.

If same failure + effectively same repair repeats:
STOP early.

Do not burn 10 iterations doing identical work.

Classify failures:

BUILDER_REPAIRABLE
Example:
- invalid generated syntax;
- missing import;
- malformed manifest;
- graph mismatch;
- wrong config generated by Builder.

USER_ACTION_REQUIRED
Example:
- invalid API key;
- revoked OAuth;
- insufficient Salesforce permission;
- billing/quota;
- database password invalid.

PROVIDER_TEMPORARY
Example:
- timeout;
- 503;
- provider rate limit.

Never attempt to "repair" a user's invalid API key.

============================================================
37. READINESS FINAL STATUS
============================================================

Canonical statuses:

ready
needs_setup
needs_attention

or maintain compatible equivalents.

READY must mean all P0 checks passed.

At minimum:

Identity           ✓
Trigger            ✓
Brain              ✓
Memory             ✓
Tools              ✓
Connections        ✓
Tool configuration ✓
Build              ✓
Verification       ✓

If required Gmail is disconnected:
NOT READY.

If LLM credential fails:
NOT READY.

If generated code failed tests:
NOT READY.

============================================================
38. PUBLISHING GATE
============================================================

Publishing must use readiness as a hard gate.

Do not allow publish simply because AgentSpec is structurally valid.

Require successful verification for current relevant version.

If the user modifies:
- LLM;
- memory;
- critical tool;
- tool config;
- system instruction;
- generated project;
then invalidate/recompute appropriate verification/readiness.

============================================================
39. PRESERVE GENERATED REAL CODE / SANDBOX
============================================================

Do not regress the generated-agent architecture back to "only JSON configuration".

Generated agents should retain real project/code artifacts.

Custom/generated code must not execute unsandboxed on the main Stack32 Agent Service host.

Preserve / finish the existing sandbox abstraction and generated-agent runtime architecture.

Do not couple Builder business logic tightly to one sandbox vendor if current abstraction already exists.

============================================================
40. LANGGRAPH PRODUCTION PERSISTENCE
============================================================

Audit current LangGraph checkpointer implementation.

Production runs requiring resumability/persistence should use a production database-backed checkpointer.

Use current official LangGraph recommendations.

If using PostgresSaver / AsyncPostgresSaver:
- initialize schema deterministically;
- call setup in an appropriate controlled initialization/migration path;
- do not create unpredictable public schema drift during arbitrary web runtime;
- use stable `thread_id`;
- preserve resume/interrupt semantics.

Important for CI:
The schema generated by running the application must not unexpectedly modify the public DB type contract.

============================================================
41. DATABASE / MIGRATION RULES
============================================================

All Stack32 database changes must be:

FORWARD-ONLY.

Never:
- reset remote production DB;
- rewrite old migration history;
- drop production data to "make tests work";
- manually patch production without checked-in migration.

Create new migrations.

Maintain RLS/security.

Service-role operations must remain ownership-scoped in application code.

============================================================
42. BACKWARD COMPATIBILITY
============================================================

Old AgentSpec versions already exist.

Do not break them.

Introduce a new additive schema version if appropriate.

Provide migrations/loaders:

legacy trigger values
→ normalized new trigger config

legacy profile-only model config
→ migration state requiring user to confirm exact model if it cannot be inferred safely

legacy memory config
→ Stack32 Memory equivalent where reasonable.

Never fabricate an exact model choice when ambiguous.

============================================================
43. I18N
============================================================

Stack32 is English-first with French translation.

ALL new user-facing copy must go through existing JSON i18n.

No hardcoded English UI strings inside React components.

Update both:
EN
FR

Includes:
- Behavior step;
- Memory;
- LLM;
- schedule;
- validation;
- connection errors;
- readiness;
- verification;
- scheduled notifications where localizable templates architecture supports it.

============================================================
44. CURRENT CI — DO NOT IGNORE IT
============================================================

The latest audited main failed CI.

You MUST reproduce and fix root causes.

Do not:
- comment out tests;
- make jobs `continue-on-error`;
- globally disable lint rules;
- increase Playwright timeout and call it fixed;
- remove DB type check;
- remove security scan.

The release gate requires GREEN CI.

============================================================
45. WEB LINT — KNOWN FAILURES TO INVESTIGATE
============================================================

Latest audited failures included issues around:

`apps/web/components/builder/agent-module-graph.tsx`

A local identifier called `module` conflicts with Next lint:
`@next/next/no-assign-module-variable`

Rename appropriately.

------------------------------------------------------------

`apps/web/components/builder/build-view.tsx`

Known categories include:

- refs accessed during render;
- `stoppedRunIdsRef.current` used while computing render data;
- state changes from effects that trigger React Compiler lint;
- `Date.now()` / purity-related issue;
- synchronous state updates in effects;
- unused variables such as:
  onSuggestion
  hasLiveForm
  gap
  soundMsgs
  depending on latest HEAD.

DO NOT sprinkle eslint-disable comments everywhere.

Refactor state properly.

Possible strategies to assess:
- represent stopped run IDs in state where rendering depends on them;
- derive baseline IDs at data acquisition or initialization rather than effect-driven setState;
- use event handlers for state transitions;
- use query/mutation lifecycle callbacks;
- use reducers/state machine;
- avoid mutating refs during render.

Use official React rules as source of truth.

------------------------------------------------------------

`message-motion.tsx`

Audit:
- assignments to refs during render;
- synchronous setState in effects;
- animation lifecycle.

Fix lifecycle architecture.

------------------------------------------------------------

`view-changes-drawer.tsx`

Audit state syncing effect.

Avoid unnecessary derived state.

------------------------------------------------------------

`prompt-composer.tsx`

Clean stale/unused variables.

------------------------------------------------------------

REQUIREMENT:

After fixes:

pnpm lint
pnpm typecheck
pnpm --filter @stack32/web test
pnpm build

must all run, not be skipped because lint failed.

============================================================
46. PYTHON / RUFF FAILURES
============================================================

Latest audit identified small but blocking Ruff failures.

Examples around:

builder/orchestrator.py
- import ordering around build_pipeline import.

learning/lessons.py
- use `datetime.UTC` rather than old `timezone.utc` pattern if Ruff requires it.

routers/knowledge.py
- FastAPI `File(...)` default triggers B008.

Resolve narrowly.
A justified targeted `# noqa: B008` on the FastAPI dependency declaration can be acceptable if that is the idiomatic safe solution.

DO NOT disable B008 globally merely for one FastAPI parameter.

tests/test_pipedream_schema.py
- import formatting/order.

Run:

ruff check . --fix

then manually resolve remaining justified issues.

Then:

pytest

Bandit
pip-audit

must still pass.

============================================================
47. DATABASE GENERATED TYPES DRIFT
============================================================

Current DB CI does:

Supabase local
→ migrations
→ pgTAP
→ generate TypeScript public schema
→ compare against committed `database.types.ts`

DB lint and pgTAP were substantially healthy.

The failing area was generated type drift.

The diff indicates LangGraph checkpoint tables were present in committed generated types but were not reproduced solely by the checked-in Supabase migrations in CI.

Likely root cause to verify:

LangGraph checkpointer runtime/setup generated tables in an environment from which database.types.ts was once generated, but fresh CI migrations do not create the same tables.

DO NOT blindly commit whichever file generation produces.

Decide source of truth.

Preferred principle:

PUBLIC APP DATABASE TYPES
must be reproducible from:
checked-in migrations + seed

only.

Runtime side effects must not be necessary to reproduce them.

Assess two options:

A. If LangGraph checkpoint tables belong to Stack32's public app schema contract:
create them deterministically via checked-in migration.

B. Preferably, if they are runtime-internal implementation tables:
place them in a dedicated/internal schema that is NOT part of:
`--schema public`
web generated public types.

Choose whichever matches current architecture/security better.

Then:
- regenerate types;
- commit deterministic generated file;
- run type generation twice;
- second run must produce zero diff.

Also remove/fix the DB lint warning for an unused PL/pgSQL variable if safe.

Do not upgrade Supabase CLI merely to hide the problem.

After source-of-truth is fixed, evaluate a CLI update separately.

============================================================
48. PLAYWRIGHT E2E FAILURE — ROOT CAUSE, NOT TIMEOUT
============================================================

Latest core journey failure:

`apps/web/tests/e2e/core-journey.spec.ts`

The test signs up and then waits for:

`**/onboarding`

It timed out.

Logs also showed browser/runtime warnings similar to:

- Router action dispatched before initialization.
- React state update on a component that hasn't mounted yet.
- side-effect during render.
- Fast Refresh full reload.

First inspect the Playwright trace/error-context artifact if available.

Reproduce locally.

Determine:

CASE A:
Product intentionally no longer redirects new signup to `/onboarding`.

Then update the test to the NEW intentional product contract.

CASE B:
The intended contract is still `/onboarding`, but auth/router/state code is racing.

Then fix application code.

Do NOT merely increase:
20 seconds → 60 seconds.

Also note:
current React render/effect purity problems may contribute to the race.

After fixing:
run core journey repeatedly to check flakiness.

At least several consecutive passes locally/CI if practical.

============================================================
49. TRIVY SECURITY WORKFLOW
============================================================

Current failure is infrastructure/configuration, not a detected vulnerability.

The workflow currently references an action version that GitHub cannot resolve:

`aquasecurity/trivy-action@0.28.0`

Research the CURRENT OFFICIAL:
aquasecurity/trivy-action
releases and README.

Pin a valid current release.

Prefer immutable SHA pinning if project security conventions support it.

Do NOT invent a SHA.

Verify the release from official repository.

Then actually run Trivy.

Do not declare Security green merely because the action now loads.

Existing:
- Gitleaks passed.
- Bandit passed.
- pip-audit passed.

Preserve them.

============================================================
50. GITHUB ACTION VERSION / NODE WARNINGS
============================================================

CI logs also indicate some actions are being forced from deprecated Node runtimes by GitHub.

Review official current versions of:
- actions/checkout;
- actions/setup-node;
- actions/upload-artifact;
- pnpm/action-setup;
- Supabase setup action.

Update only when official compatible versions exist and after testing.

Do not make a giant dependency upgrade unrelated to this project merely to eliminate warnings.

============================================================
51. EMAIL SECURITY
============================================================

Scheduled result emails can contain user-sensitive summaries.

Keep summaries short.

Do not include:
- API keys;
- OAuth tokens;
- full tool payloads;
- private internal stack traces;
- database connection strings.

Escape HTML.

For failure emails:
show user-actionable message,
not raw exception dump.

============================================================
52. OBSERVABILITY
============================================================

For production, emit structured events for:

agent.run.started
agent.run.completed
agent.run.failed

schedule.claimed
schedule.enqueued
schedule.completed
schedule.failed

notification.email.sent
notification.email.failed

llm.validation.succeeded
llm.validation.failed

memory.cleanup.completed

tool.connection.required
tool.execution.started
tool.execution.completed
tool.execution.failed

Never log secrets.

Use request/run/agent identifiers for correlation.

============================================================
53. RATE LIMITING / ABUSE
============================================================

Audit existing rate limits and cost controls.

Generated agents use customer LLM keys, but Stack32 still pays for:
- Builder usage;
- infrastructure;
- sandbox;
- DB;
- network;
- possibly Pipedream.

Apply sensible limits to:
- Builder concurrent runs;
- generated agent concurrent runs;
- schedule frequency;
- schedule overlap;
- repair loops;
- external memory failures;
- Pipedream calls;
- verification calls.

Do not allow 1 user to create an infinite schedule loop.

============================================================
54. QUEUE / WORKER RELIABILITY
============================================================

Audit current run queue.

Ensure:
- one queued occurrence executes once under normal conditions;
- leases expire/reclaim;
- retries bounded;
- dead-letter/final failure represented;
- canceled run does not later become successful;
- queue worker is horizontally safe.

Do not execute same run both inline and queued accidentally.

============================================================
55. BUILD / VERIFY ACTIVITY UI
============================================================

When Builder performs final verification, the user should see truthful operations such as:

Building agent
✓ Project generated
✓ Runtime configured

Connecting capabilities
✓ Gmail connected
✓ HubSpot configured

Testing
✓ Model responded
✓ Memory works
✓ Tool schemas loaded

Final verification
✓ 8 checks passed

or:

Testing
✕ Model access failed

Action required:
"The API key is valid but this account cannot access the selected model."

Do not expose stack traces by default.

============================================================
56. DYNAMIC USER QUESTIONS DURING BUILD
============================================================

Builder can interrupt itself when genuinely required.

Rules:

If information can be inferred safely:
infer it.

If a choice materially affects external account/tool:
ask.

If multiple questions are known:
ask together.

Example:

"I need two details before connecting your tools."

Email provider
[ Gmail ]

CRM
[ HubSpot ]

Do not ask about:
irrelevant technical framework choices.

User should not need to understand:
OAuth scopes
LangGraph
tool schemas
PostgresSaver
Pipedream components.

Stack32 handles implementation.

============================================================
57. NO USER-PROVIDED PIPEDREAM ACCOUNT
============================================================

Never display:

"Enter your Pipedream account credentials."

Stack32 owns the Pipedream project/client.

End users only authenticate the third-party app they want to connect.

Examples:

Connect Gmail
Connect Slack
Connect Notion
Connect HubSpot

Pipedream remains infrastructure.

============================================================
58. EXTERNAL MEMORY IS DIFFERENT
============================================================

Pipedream integration tools:
YES, use Pipedream where appropriate.

Core per-turn external memory:
NO, use native Postgres provider.

Reason:
memory read/write is part of runtime context construction and needs predictable low-latency, bounded access.

Do not confuse:
"Use Supabase as a business tool"
with
"Use Supabase/Postgres as the agent's memory backend".

============================================================
59. MODEL / TOOL CALL LOOP
============================================================

Generated runtime should maintain a real agent loop:

messages/context
↓
model call
↓
final response OR structured tool call
↓
validate tool
↓
approval if required
↓
execute
↓
tool observation
↓
append observation
↓
model call
↓
...
↓
final response

Respect limits:
max steps
max model calls
max tool calls
timeout

Do not parse arbitrary prose using regex to decide tool calls.

Prefer provider-native structured function/tool calling through the normalized gateway.

============================================================
60. FINAL ANSWER INTEGRITY
============================================================

The agent final response should be grounded in its actual execution state.

If a tool returned:
CONNECTION_REQUIRED

final answer should say:
"Slack needs to be connected before I can do that."

Not:
"Done."

If approval is pending:
say approval is required.

If partial:
state what completed and what did not.

============================================================
61. HUMAN APPROVAL
============================================================

Do not auto-approve write actions just because the agent was created by the user.

Keep explicit/conditional approval architecture.

Persist approval decisions correctly within appropriate run scope.

Do not reuse an approval for an unrelated later dangerous action.

============================================================
62. TEST MATRIX — BUILDER
============================================================

Add/maintain tests proving:

1. initial prompt creates Identity form;
2. submit Identity immediately shows working state;
3. no refresh required;
4. old Google `connection_intent` form never appears;
5. composer locked while Builder owns initial setup;
6. Behavior form appears;
7. Chat can be selected alone;
8. Schedule can be selected alone;
9. both can be selected;
10. at least one required;
11. Stack32 Memory default;
12. External Memory branches correctly;
13. Documents not asked universally;
14. LLM step always occurs before Build;
15. invalid LLM does not permit Build;
16. valid exact model enables Build;
17. free-text provider ambiguity groups questions;
18. new messages reveal sequentially;
19. refresh does not replay old animation;
20. Stop cancels coherently.

============================================================
63. TEST MATRIX — LLM
============================================================

Tests for:

valid OpenAI credential
invalid OpenAI auth
valid key but inaccessible model
quota error
rate limit
timeout
temporary provider outage

Repeat equivalent normalized adapter tests for supported providers.

Critical assertion:

GeneratedAgentRuntime MUST NOT use platform fallback credential when user agent secret missing.

Write an automated regression test specifically for this.

============================================================
64. TEST MATRIX — MEMORY
============================================================

Stack32 Memory:

- recent context;
- summary;
- long-term memory;
- explicit remember;
- secret rejection;
- max item cap;
- retention;
- cleanup;
- per-agent isolation;
- per-user isolation.

External PostgreSQL:

- valid connection;
- wrong password;
- network timeout;
- TLS failure;
- missing CREATE permission;
- table/schema creation idempotency;
- write/read/delete;
- credential never serialized into AgentSpec/log/chat.

Supabase/Postgres should work with a realistic test Postgres instance.

============================================================
65. TEST MATRIX — SCHEDULER
============================================================

Test:

- hourly;
- daily;
- weekly;
- Europe/Paris timezone;
- DST boundary if scheduling library allows deterministic testing;
- next_run_at;
- disabled schedule;
- concurrent tick workers;
- same occurrence cannot enqueue twice;
- failed worker claim recovery;
- retries bounded;
- Schedule-only agent;
- Chat+Schedule agent;
- scheduled run history;
- schedule's actual instruction used;
- terminal email notification;
- email failure does not fail run.

============================================================
66. TEST MATRIX — TOOLS
============================================================

At minimum prove:

Native/read-only tool
Pipedream tool
Google connector if current native path remains
approval-required write tool

And:

same user
two agents
two different connections
correct account resolved per agent.

No auth ID from LLM arguments may override server binding.

============================================================
67. PIPEDREAM REAL E2E ACCEPTANCE
============================================================

After implementation and once credentials are available, manually prove:

real Stack32 user
↓
real Pipedream production Connect flow
↓
real account
↓
Stack32 account sync
↓
agent binding
↓
JIT schema
↓
runtime tool call
↓
real provider API
↓
observation
↓
final response

Do not call this "tested" if only mocks ran.

Separate:
AUTOMATED TESTS
from
LIVE INTEGRATION ACCEPTANCE.

============================================================
68. RELEASE-GATE E2E AGENT
============================================================

The final acceptance agent should be:

"Create an AI assistant that can manage my Google Calendar and send Slack messages. It should remember our conversations and be available in chat."

Expected setup:

Identity
✓

Behavior
Chat enabled
Stack32 Memory
✓

Brain
user-selected provider
exact model
user API key
✓

Build
✓

Tool resolution:
Google Calendar
Slack
✓

Connect Calendar
✓

Connect Slack through Pipedream
✓

Structure:

[ Chat ] → [ AI Agent ] → [ Output ]
                │
                ├ Exact Model
                ├ Stack32 Memory
                ├ Google Calendar
                └ Slack

============================================================
69. RELEASE-GATE LIVE TEST 1 — CALENDAR
============================================================

Message:

"Create a calendar event tomorrow at 3 PM called Stack32 Test."

Expected:

Agent proposes/uses calendar tool.
Approval required if policy requires.
After approval:
REAL event is created.

Agent final message only says success after tool confirms success.

============================================================
70. RELEASE-GATE LIVE TEST 2 — SLACK
============================================================

Message:

"Send a message to my configured Slack channel saying 'Stack32 works'."

Expected:

correct agent-bound Slack account
approval
real message
tool observation
final confirmation

============================================================
71. RELEASE-GATE MEMORY TEST
============================================================

Message:

"What did I ask you to schedule?"

Agent must use conversation/memory and answer correctly.

============================================================
72. RELEASE-GATE CONNECTION FAILURE TEST
============================================================

Disconnect Slack.

Then:

"Send another Slack message saying hello."

Expected:

Agent MUST NOT hallucinate success.

Expected response equivalent:

"Slack needs to be connected before I can send that message."

Readiness/tool status should reflect missing connection.

============================================================
73. RELEASE-GATE SCHEDULE TEST
============================================================

Enable a schedule on a test agent.

Set an explicit safe scheduled instruction.

Verify:

schedule becomes due
↓
exactly one run enqueued
↓
agent executes
↓
run visible in Stack32
↓
terminal result stored
↓
email notification sent to Stack32 account email when option enabled

============================================================
74. RELEASE-GATE EXTERNAL MEMORY TEST
============================================================

Create a test agent with External Memory.

Use a real isolated test PostgreSQL/Supabase database.

Verify:

connect
validate
initialize namespace
write
read on later run
delete hidden validation data
retention behavior

No credential leakage.

============================================================
75. CI RELEASE GATE
============================================================

Before this project is declared production-ready, latest main must have:

Web lint                 GREEN
Web typecheck            GREEN
Web unit tests           GREEN
Web build                GREEN

Python Ruff              GREEN
Python pytest            GREEN

Supabase DB lint         GREEN
pgTAP                    GREEN
Generated DB types       deterministic / GREEN

Playwright E2E           GREEN

Gitleaks                 GREEN
Bandit                   GREEN
pip-audit                GREEN
Trivy                    GREEN

No skipped critical step because an earlier command failed.

============================================================
76. DO NOT CHEAT THE RELEASE GATE
============================================================

Forbidden "fixes":

`|| true`

`continue-on-error: true`

removing failing tests

turning assertions into warnings

globally disabling React lint

removing generated-type comparison

mocking all integrations and calling them production-ready

changing Playwright timeout without root-cause fix

deleting security jobs

turning readiness errors into warnings

============================================================
77. PERFORMANCE / 3,000–5,000 USERS
============================================================

Do not over-engineer for 10 million users.

But architecture must comfortably support thousands.

Check for:

N+1 DB calls
full-table scans
unbounded messages
unbounded memory
unbounded connection pools
polling every second forever
thundering herd schedule ticks
per-agent background loops
synchronous long-running HTTP requests
huge tool catalogs sent to LLM
unbounded repair loops

Use:
indexes
pagination
bounded polling
queue workers
batch cleanup
JIT loading
proper connection management.

============================================================
78. SECURITY REVIEW
============================================================

Re-check:

JWT ownership
service-role boundaries
agent isolation
secret encryption
Pipedream account isolation
external memory credentials
LLM BYOK isolation
OAuth callback state/CSRF
tool approval
SSRF protections for HTTP/fetch capabilities
sandbox isolation
prompt injection treatment
logging redaction
rate limits.

Do not loosen existing protections.

============================================================
79. USER-FACING ERROR QUALITY
============================================================

Every likely failure should become useful.

Bad:

"MODEL_PROVIDER_UNAVAILABLE"

Good:

"OpenAI accepted your API key, but this account can't use the selected model."

Bad:

"500"

Good:

"I couldn't connect to your PostgreSQL database. Check the password and connection string."

Bad:

"Tool execution error"

Good:

"Slack was disconnected. Reconnect Slack before the agent can send messages."

Keep technical details available for logs/admin diagnostics.

============================================================
80. MIGRATION / DATA MODEL EXPECTATIONS
============================================================

Before implementation, identify the smallest forward-only set of schema additions required.

Likely areas to inspect:

Agent model config
LLM validation metadata
Memory provider config/reference
External memory encrypted secret reference
Schedule state / next_run_at
Schedule notification preference
Schedule occurrence idempotency
Verification runs/results
Readiness state
Notification delivery audit

Avoid duplicating fields that already exist.

Audit current schema first.

============================================================
81. EMAIL ACCOUNT ADDRESS
============================================================

Notification recipient should come from authenticated Stack32 account identity.

Do not ask the user to type a notification email in MVP.

Use their Stack32 login/account email.

Ensure server retrieves it securely.

If account has no valid email:
disable notification or clearly explain configuration issue.

============================================================
82. BUILDER SHOULD HANDLE TOOL CONFIGURATION FOR USER
============================================================

User should not need to understand Pipedream configurable_props.

Example:

Slack tool requires channel.

Stack32 asks:

"Which Slack channel should this agent use?"

[ #sales ▼ ]

The options should be fetched dynamically from connected account.

Example:

Google Calendar:
"Which calendar should this agent use?"

[ Primary ▼ ]

Stack32 stores static tool configuration.

The LLM then does NOT receive unnecessary static configuration choices every runtime call.

============================================================
83. EXTERNAL TOOL CATALOG
============================================================

Do not preload everything.

Builder may search Pipedream catalog intelligently.

Use namespaces/dynamic discovery where possible.

Only install/attach relevant exact actions.

Keep provider/action metadata in spec/bindings so runtime can reproduce exact behavior.

============================================================
84. BUILDER TOOL SEARCH QUALITY
============================================================

When Builder searches for a capability:

"send email"

do not automatically choose the first arbitrary search result.

First resolve:
provider/app intent.

Then choose exact action.

Example:

Gmail
→ Send Email

HubSpot
→ Create Contact

Keep action version metadata if needed for reproducibility.

============================================================
85. NO PRIVATE REASONING UI
============================================================

Never create UI saying:

"Chain of thought"
"My reasoning"
"Hidden thoughts"

Allowed operational ledger:

Objective
Steps
Current operation
Files changed
Tools configured
Tests
Failures
Repairs
Next action

This is observable work, not private chain-of-thought.

============================================================
86. BUILDER WORK LEDGER
============================================================

Preserve/strengthen WorkLedger or equivalent.

Useful fields:

objective
current_phase
completed_steps
pending_steps
files_touched
tools_selected
connections_needed
test_results
repair_attempt
blockers
next_action

Persist enough to resume robustly.

Do not dump it verbatim into end-user messages.

============================================================
87. BUILD INTERRUPTION / RESUME
============================================================

OAuth and setup forms are interrupts.

They must resume idempotently.

Refreshing browser must not:
- duplicate Identity;
- lose current run;
- create new tool binding;
- execute same build twice.

Use stable request/interrupt identifiers.

============================================================
88. READINESS / STRUCTURE SOURCE OF TRUTH
============================================================

Do not have Structure invent connection readiness by UI string heuristics when server can provide canonical readiness.

Where possible:
server readiness → frontend rendering.

Reduce duplicated inference logic between:
AgentSpec
GraphSpec
frontend `agent-modules.ts`
readiness evaluator.

Keep frontend display transformation simple.

============================================================
89. REQUIRED DOCUMENTATION UPDATES
============================================================

After implementation update:

README
architecture docs
environment example
production deployment docs
Pipedream setup
SMTP setup
scheduler setup
external memory setup
BYOK providers
release checklist

Remove stale docs claiming earlier phases are still active if no longer true.

No real secrets in `.env.example`.

============================================================
90. EXTERNAL CONFIGURATION REPORT
============================================================

At the end, provide a concise list of things the project owner must configure outside code.

Example categories:

Pipedream
- Project ID
- Client ID
- Client Secret
- production environment/access

IONOS SMTP
- Host
- Port
- Username
- Password
- From address

Stack32 platform LLM keys
- Builder only

Sandbox
- relevant provider key

Deployment scheduler/worker
- cron/tick infrastructure if external scheduler is required

Do not ask for values that the repository/deployment already contains securely.

Never print existing secret values.

============================================================
91. IMPLEMENTATION MILESTONES
============================================================

Your PLAN should be organized in dependency order approximately like this.

------------------------------------------------------------
M0 — BASELINE / REPRODUCTION
------------------------------------------------------------

- fetch latest main;
- record SHA;
- inspect architecture;
- run existing tests;
- reproduce CI;
- map existing good systems;
- verify external docs;
- capture baseline.

No product changes.

------------------------------------------------------------
M1 — MVP SCHEMA / GENERATED AGENT FUNDAMENTALS
------------------------------------------------------------

- trigger model = Chat/Schedule product model;
- exact LLM model config;
- memory provider config;
- backward compatibility/migrations;
- canonical readiness model adjustments.

Tests.

------------------------------------------------------------
M2 — BUILDER INITIAL SETUP / UX STATE MACHINE
------------------------------------------------------------

- remove early Google question;
- new Identity → Behavior/Memory → LLM → Build flow;
- remove universal Documents;
- no silence;
- composer locking;
- live activity;
- sequential bubbles;
- refresh/resume/idempotency.

Tests.

------------------------------------------------------------
M3 — MEMORY
------------------------------------------------------------

- Stack32 Memory;
- context builder;
- summaries;
- retention;
- limits;
- cleanup;
- PostgresMemoryProvider;
- Supabase/Postgres connection;
- encrypted credentials.

Tests.

------------------------------------------------------------
M4 — EXACT LLM / BYOK
------------------------------------------------------------

- provider adapters;
- exact models;
- mandatory credential validation;
- error classification;
- agent-scoped credential enforcement;
- readiness P0 brain checks.

Tests.

If dependencies make it cleaner to implement M4 before parts of M3, adjust plan explicitly.

------------------------------------------------------------
M5 — PRODUCTION SCHEDULER + EMAIL
------------------------------------------------------------

- recurrence;
- timezone;
- next_run_at;
- atomic claiming;
- idempotency;
- queue;
- scheduled histories;
- terminal email notification;
- SMTP service.

Tests.

------------------------------------------------------------
M6 — TOOL RESOLUTION / PIPEDREAM PRODUCTION E2E
------------------------------------------------------------

- preserve current architecture;
- provider clarification;
- production environment;
- connect;
- account selection;
- bindings;
- dynamic config;
- JIT schema;
- approval.

Tests.

------------------------------------------------------------
M7 — FINAL VERIFIER / SELF-REPAIR
------------------------------------------------------------

- six verification layers;
- error classification;
- repair loop target 3–5;
- hard max 10;
- repeated failure detection;
- readiness integration.

Tests.

------------------------------------------------------------
M8 — STRUCTURE SIMPLIFICATION
------------------------------------------------------------

- Chat/Schedule;
- AI Agent;
- Output;
- Model/Memory/user tools;
- hide internal noise;
- canonical readiness.

Tests / visual check.

------------------------------------------------------------
M9 — CI / SECURITY / E2E
------------------------------------------------------------

- React lint;
- Python Ruff;
- DB generated type reproducibility;
- Playwright signup/onboarding race;
- Trivy action;
- all workflows.

Do not stop until green.

------------------------------------------------------------
M10 — RELEASE ACCEPTANCE
------------------------------------------------------------

Run entire acceptance matrix.

Produce final release report.

============================================================
92. EACH MILESTONE IMPLEMENTATION RULE
============================================================

After plan approval, for every milestone:

1. state exact objective;
2. make smallest coherent change;
3. migrate DB if necessary;
4. run focused tests;
5. run adjacent regression tests;
6. report failures;
7. fix them;
8. only then continue.

Do not implement all 10 milestones blindly and test only at the end.

============================================================
93. DO NOT REWRITE WORKING PIPEDREAM/E2B SYSTEMS
============================================================

This point is critical.

Before changing a subsystem:
inspect current implementation.

If it already satisfies requirement:
KEEP IT.

Examples likely already substantially implemented:
- Pipedream prop normalization;
- JIT schemas;
- per-agent bindings;
- server-side Pipedream auth injection;
- provider registry;
- generated project foundations;
- sandbox abstraction;
- readiness foundations;
- Builder operational events;
- React Flow Structure.

Extend, don't churn.

============================================================
94. EXPECTED PLAN MODE OUTPUT
============================================================

Your response in PLAN MODE must use these sections:

A. CURRENT BASELINE

- actual HEAD SHA;
- branch;
- relevant services;
- current database state;
- current tests/CI state.

B. AUDIT AGAINST THIS SPEC

For each major requirement:
- Already correct
- Partially correct
- Missing
- Wrong / obsolete

C. ROOT CAUSES OF CURRENT FAILURES

Especially:
- Builder silent transition;
- obsolete early Google connection step;
- generated-agent LLM;
- memory;
- scheduler;
- Playwright;
- generated DB types;
- React lint;
- Ruff;
- Trivy.

D. ARCHITECTURE DECISIONS

Explain exact chosen design for:
- triggers;
- memory providers;
- LLM config;
- schedules;
- notification;
- verifier;
- readiness;
- Structure.

E. DATABASE CHANGES

List:
migration name/purpose
tables/columns/indexes/RLS
backward migration/loading behavior.

F. FILE-BY-FILE CHANGE MAP

For every likely file:
path
change
reason
dependencies
tests.

G. MILESTONE PLAN

M0 → M10
with exact acceptance criteria.

H. TEST PLAN

Unit
integration
E2E
live manual acceptance.

I. EXTERNAL CONFIGURATION REQUIRED

What you need from project owner.

Do NOT request secret values inside chat unless the implementation reaches a step where they are truly needed.

J. RISKS / BACKWARD COMPATIBILITY

K. RELEASE GATE

Exact checklist required before:
"Stack32 MVP is production-ready."

============================================================
95. AFTER PLAN APPROVAL — FINAL IMPLEMENTATION REPORT
============================================================

Once implementation has later been completed, final report must include:

- final commit SHA;
- files changed;
- migrations added;
- architecture changes;
- commands executed;
- lint results;
- unit test results;
- integration test results;
- E2E results;
- security results;
- live tests performed;
- any tests not possible because external credential is missing;
- exact remaining external setup;
- remaining risks;
- whether product is:

NOT READY
BETA READY
PRODUCTION READY

Do not claim PRODUCTION READY while any release-gate P0 is red.

============================================================
96. DEFINITION OF DONE
============================================================

This project is complete only when a real user can:

1. sign up/login;
2. create an agent from a natural language prompt;
3. complete Identity;
4. select Chat/Schedule;
5. choose Stack32 Memory or external PostgreSQL/Supabase memory;
6. select an exact LLM;
7. provide their own API key;
8. have that exact key/model validated;
9. click Build;
10. watch Stack32 genuinely build the agent;
11. answer any genuinely necessary tool-provider clarifications;
12. connect apps without creating a Pipedream account;
13. have those connections bound to the correct generated agent;
14. see a simple Structure;
15. use the generated agent in Chat;
16. have the agent make structured tool calls;
17. approve side effects;
18. see truthful final results;
19. have the agent remember relevant context;
20. schedule an automatic run;
21. see the scheduled run in Stack32;
22. optionally receive terminal email notification;
23. disconnect a tool and have agent correctly report that it is disconnected;
24. have Builder verification catch and repair builder-owned errors;
25. reach Ready only after P0 verification;
26. have all CI/security/release gates green.

============================================================
97. FINAL PRINCIPLE
============================================================

Keep Stack32 simple for the customer and sophisticated underneath.

Customer sees:

Prompt
→ Identity
→ Behavior + Memory
→ Brain
→ Build
→ Connect required tools
→ Ready

Generated agent is conceptually:

Chat / Schedule
      ↓
   AI Agent
   ├ Model
   ├ Memory
   └ Tools
      ↓
    Output

Everything else is Stack32 infrastructure.

Do not make users configure the infrastructure that Stack32 exists to configure for them.

Now begin PLAN MODE.

Do not modify the repository yet.

First audit the ACTUAL latest main branch, reproduce the known failures, verify the assumptions in this specification against the existing implementation and official documentation, and return the complete implementation plan in the required A–K format.