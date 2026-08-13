"""Builder capability extraction and tool resolution (hybrid integrations)."""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from pydantic import BaseModel, Field

from agent_service.models.agent_spec import ConnectionRequirement, ToolBinding

logger = logging.getLogger(__name__)

_BUILTIN_TOOL_IDS = ("current_datetime", "structured_output")

# Popular SaaS names → Pipedream app slug hints. Not exhaustive (3000+ apps);
# unknown names still go through JIT Pipedream search via LLM tool_hints.
_PIPEDREAM_APP_ALIASES: dict[str, str] = {
    "notion": "notion",
    "slack": "slack_v2",
    "slack_v2": "slack_v2",
    "slack bot": "slack_bot",
    "stripe": "stripe",
    "airtable": "airtable",
    "hubspot": "hubspot",
    "salesforce": "salesforce",
    "shopify": "shopify",
    "github": "github",
    "gitlab": "gitlab",
    "jira": "jira",
    "linear": "linear",
    "asana": "asana",
    "trello": "trello",
    "monday": "monday",
    "clickup": "clickup",
    "discord": "discord",
    "telegram": "telegram",
    "whatsapp": "whatsapp",
    "twitter": "twitter",
    "x.com": "twitter",
    "linkedin": "linkedin",
    "facebook": "facebook",
    "instagram": "instagram",
    "youtube": "youtube",
    "zoom": "zoom",
    "twilio": "twilio",
    "sendgrid": "sendgrid",
    "mailchimp": "mailchimp",
    "klaviyo": "klaviyo",
    "intercom": "intercom",
    "zendesk": "zendesk",
    "freshdesk": "freshdesk",
    "dropbox": "dropbox",
    "box": "box",
    "onedrive": "microsoft_onedrive",
    "outlook": "microsoft_outlook",
    "teams": "microsoft_teams",
    "excel": "microsoft_excel",
    "sheets": "google_sheets",
    "google sheets": "google_sheets",
    "google drive": "google_drive",
    "drive": "google_drive",
    "google calendar": "google_calendar",
    "google docs": "google_docs",
    "docs": "google_docs",
    "gmail": "gmail",
    "supabase": "supabase",
    "postgres": "postgresql",
    "postgresql": "postgresql",
    "mysql": "mysql",
    "mongodb": "mongodb",
    "snowflake": "snowflake",
    "aws": "aws",
    "s3": "aws",
    "openai": "openai",
    "anthropic": "anthropic",
    "figma": "figma",
    "canva": "canva",
    "typeform": "typeform",
    "calendly": "calendly",
    "pipedrive": "pipedrive",
    "zoho": "zoho_crm",
    "woocommerce": "woocommerce",
    "wordpress": "wordpress_com",
    "reddit": "reddit",
    "pinterest": "pinterest",
    "spotify": "spotify",
    "todoist": "todoist",
    "evernote": "evernote",
    "confluence": "confluence",
    "bitbucket": "bitbucket",
    "pagerduty": "pagerduty",
    "datadog": "datadog",
    "sentry": "sentry",
    "mixpanel": "mixpanel",
    "amplitude": "amplitude",
    "segment": "segment",
    "braze": "braze",
    "customer.io": "customer_io",
    "close": "close",
    "copper": "copper",
    "apollo": "apollo_io",
    "clearbit": "clearbit",
    "hunter": "hunter",
    "coda": "coda",
    "miro": "miro",
    "loom": "loom",
    "vimeo": "vimeo",
    "cloudflare": "cloudflare",
    "vercel": "vercel",
    "netlify": "netlify",
    "heroku": "heroku",
    "digitalocean": "digital_ocean",
    "openai chatgpt": "openai",
    "chatgpt": "openai",
}

# Capability id → search / preferred native tool ids
_CAPABILITY_CATALOG: dict[str, dict[str, Any]] = {
    "email": {
        "name": "Email / Gmail",
        "description": "Read, draft, or send email via Gmail.",
        "keywords": [
            "email",
            "gmail",
            "mail",
            "inbox",
            "courriel",
            "e-mail",
            "envoie",
            "envoyer",
            "courrier",
        ],
    },
    "calendar": {
        "name": "Calendar",
        "description": "List or create calendar events.",
        "keywords": [
            "calendar",
            "agenda",
            "meeting",
            "schedule",
            "rdv",
            "appointment",
            "event",
        ],
    },
    "research": {
        "name": "Research / Web",
        "description": "Search the web and fetch public URLs.",
        "keywords": [
            "research",
            "web",
            "search",
            "news",
            "browse",
            "internet",
            "fetch",
        ],
    },
    "knowledge": {
        "name": "Knowledge",
        "description": "Search the agent knowledge base (RAG).",
        "keywords": [
            "knowledge",
            "rag",
            "knowledge base",
            "base de connaissances",
            "pdf knowledge",
            "retrieval",
        ],
    },
    "google_docs": {
        "name": "Google Docs",
        "description": "Create and update Google Docs summaries.",
        "keywords": [
            "google docs",
            "googledocs",
            "google doc",
            "docs.google",
            "drive",
            "google drive",
            "document google",
            "fichier google",
            "doc google",
        ],
    },
    "slack": {
        "name": "Slack",
        "description": "Message or read Slack channels.",
        "keywords": ["slack", "workspace chat", "channel message"],
    },
    "writing": {
        "name": "Writing only",
        "description": "Compose text without external tools beyond builtins.",
        "keywords": [
            "write",
            "writing",
            "draft text",
            "copywriting",
            "rédaction",
            "rewrite",
            "summarize only",
        ],
    },
    "calculator": {
        "name": "Calculator",
        "description": "Arithmetic and numeric scoring.",
        "keywords": ["calc", "calculator", "math", "number", "score", "arith"],
    },
}


class Capability(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=500)
    keywords: list[str] = Field(default_factory=list, max_length=32)


class PlannedCapability(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    preferred_app: str | None = None
    intent: str | None = None  # send|read|draft|create|list|write
    provider_preference: str = "any"  # native|pipedream|any


class CapabilityPlan(BaseModel):
    """Structured capability plan — LLM hints preferred; aliases are fallback."""

    capabilities: list[PlannedCapability] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)

    def capability_ids(self) -> set[str]:
        return {c.id for c in self.capabilities}

    def to_capabilities(self) -> list[Capability]:
        out: list[Capability] = []
        for planned in self.capabilities:
            meta = _CAPABILITY_CATALOG.get(planned.id)
            if meta:
                out.append(
                    Capability(
                        id=planned.id,
                        name=str(meta["name"]),
                        description=str(meta["description"]),
                        keywords=list(meta["keywords"]),
                    )
                )
            else:
                out.append(
                    Capability(
                        id=planned.id,
                        name=planned.id.replace("_", " ").title(),
                        description="",
                        keywords=[planned.preferred_app] if planned.preferred_app else [],
                    )
                )
        return out


def build_capability_plan(
    prompt: str,
    *,
    llm_hints: list[str] | None = None,
    preferred_apps: list[str] | None = None,
) -> CapabilityPlan:
    """Build a CapabilityPlan from heuristics + optional structured LLM hints.

    `llm_hints` may be short keywords (`slack`, `gmail`) or `app:intent` pairs
    (`slack:send`, `outlook:email`). Preferred apps override Google when the user
    asked for Outlook / non-Google email.
    """
    caps = extract_capabilities(prompt, llm_hints=llm_hints)
    apps = list(preferred_apps or []) or extract_external_app_queries(
        prompt, llm_hints=llm_hints
    )
    lower = (prompt or "").lower()
    ambiguities: list[str] = []

    # Ambiguous email without provider → ask business question later.
    mentions_email = bool(re.search(r"\b(email|mail|e-mail|courriel)\b", lower))
    mentions_gmail = "gmail" in lower or "google mail" in lower
    mentions_outlook = "outlook" in lower or "microsoft mail" in lower
    if mentions_email and not mentions_gmail and not mentions_outlook:
        if not any(a in {"gmail", "microsoft_outlook", "outlook"} for a in apps):
            ambiguities.append("email_provider")

    # Ambiguous CRM without a named provider → ask which CRM later.
    mentions_crm = bool(re.search(r"\bcrm\b", lower))
    _named_crms = {
        "hubspot",
        "salesforce",
        "pipedrive",
        "zoho",
        "zoho_crm",
        "close",
        "copper",
    }
    mentions_named_crm = any(k in lower for k in _named_crms) or any(
        a in _named_crms for a in apps
    )
    if mentions_crm and not mentions_named_crm:
        ambiguities.append("crm_provider")

    # Prefer Outlook over Google when explicitly asked.
    force_outlook = mentions_outlook or any(
        a in {"outlook", "microsoft_outlook"} for a in apps
    )
    planned: list[PlannedCapability] = []
    for cap in caps:
        preferred: str | None = None
        intent: str | None = None
        provider_pref = "any"
        if cap.id == "email":
            if force_outlook:
                preferred = "microsoft_outlook"
                provider_pref = "pipedream"
            elif mentions_gmail:
                preferred = "gmail"
                provider_pref = "native"
            if re.search(r"\b(send|envoie|envoyer)\b", lower) and not re.search(
                r"\b(draft|brouillon)\b", lower
            ):
                intent = "send"
            elif re.search(r"\b(draft|brouillon)\b", lower):
                intent = "draft"
            elif re.search(r"\b(read|inbox|list|triage)\b", lower):
                intent = "read"
        elif cap.id == "slack":
            preferred = "slack_v2"
            provider_pref = "pipedream"
            intent = "send" if re.search(r"\b(send|post|message)\b", lower) else "write"
        elif cap.id == "calendar":
            preferred = "google_calendar"
            provider_pref = "native"
            intent = (
                "create"
                if re.search(r"\b(create|book|schedule|ajouter|créer|creer)\b", lower)
                else "list"
            )
        elif cap.id == "google_docs":
            preferred = "google_docs"
            provider_pref = "native"
            intent = "write"
        planned.append(
            PlannedCapability(
                id=cap.id,
                preferred_app=preferred,
                intent=intent,
                provider_preference=provider_pref,
            )
        )

    # Attach long-tail apps not covered by catalog caps.
    known = {p.id for p in planned}
    for app in apps:
        if app in {"gmail", "google_calendar", "google_docs"} and not force_outlook:
            continue
        if app in {"outlook", "microsoft_outlook"} and "email" in known:
            continue
        syn_id = f"ext:{app}"
        if syn_id in known or app in known:
            continue
        planned.append(
            PlannedCapability(
                id=syn_id,
                preferred_app=app,
                provider_preference="pipedream",
            )
        )

    # Merge structured llm hint pairs app:intent
    for hint in llm_hints or []:
        h = str(hint).strip().lower()
        if ":" not in h:
            continue
        app, intent = h.split(":", 1)
        app, intent = app.strip(), intent.strip()
        if not app:
            continue
        matched = next((p for p in planned if p.preferred_app == app or p.id == app), None)
        if matched:
            matched.intent = intent or matched.intent
            matched.preferred_app = matched.preferred_app or app
        else:
            planned.append(
                PlannedCapability(
                    id=f"ext:{app}",
                    preferred_app=app,
                    intent=intent or None,
                    provider_preference="pipedream",
                )
            )

    return CapabilityPlan(capabilities=planned, ambiguities=ambiguities)


def extract_capabilities(
    prompt: str, *, llm_hints: list[str] | None = None
) -> list[Capability]:
    """Deterministic keyword/heuristic capability extractor.

    Optionally merges an LLM-structured list of short hints (tool keywords).
    """
    hay = f"{prompt or ''} {' '.join(llm_hints or [])}".lower()
    found: list[Capability] = []
    seen: set[str] = set()

    def _add(cap_id: str) -> None:
        if cap_id in seen:
            return
        meta = _CAPABILITY_CATALOG.get(cap_id)
        if not meta:
            return
        seen.add(cap_id)
        found.append(
            Capability(
                id=cap_id,
                name=str(meta["name"]),
                description=str(meta["description"]),
                keywords=list(meta["keywords"]),
            )
        )

    for cap_id, meta in _CAPABILITY_CATALOG.items():
        if cap_id == "writing":
            continue
        for kw in meta["keywords"]:
            if kw in hay or re.search(rf"\b{re.escape(kw)}\b", hay):
                _add(cap_id)
                break

    # LLM hints may be raw tool names / categories
    for hint in llm_hints or []:
        h = str(hint).strip().lower()
        if not h:
            continue
        if ":" in h:
            h = h.split(":", 1)[0].strip()
        if h in _CAPABILITY_CATALOG:
            _add(h)
        elif any(x in h for x in ("email", "gmail", "mail")):
            _add("email")
        elif "calendar" in h or "agenda" in h:
            _add("calendar")
        elif h in ("web", "search", "research", "news") or "web" in h:
            _add("research")
        elif any(x in h for x in ("knowledge", "rag", "pdf knowledge")):
            _add("knowledge")
        elif any(x in h for x in ("google docs", "docs", "drive")):
            _add("google_docs")
        elif "slack" in h:
            _add("slack")
        elif h in ("calc", "math", "calculator"):
            _add("calculator")
        elif "writ" in h:
            _add("writing")

    # Writing-only when no integration-ish capabilities and writing cues, or empty prompt tools.
    integration_ids = {
        "email",
        "calendar",
        "research",
        "knowledge",
        "google_docs",
        "slack",
        "calculator",
    }
    has_integration = bool(seen & integration_ids)
    writing_cues = any(kw in hay for kw in _CAPABILITY_CATALOG["writing"]["keywords"])
    if not has_integration and (writing_cues or not found):
        # Pure writing / underspecified → builtins only (writing capability).
        if writing_cues or not found:
            _add("writing")

    return found


def _email_tool_ids(prompt_lower: str) -> list[str]:
    """Least privilege: send-only ≠ read/list; draft vs send from intent."""
    wants_send = bool(
        re.search(r"\b(send|envoie|envoyer|dispatch)\b", prompt_lower)
        and not re.search(r"\b(draft|brouillon)\b", prompt_lower)
    )
    wants_draft = bool(
        re.search(r"\b(draft|brouillon|compose|rédige|redige)\b", prompt_lower)
    )
    wants_read = bool(
        re.search(
            r"\b(read|inbox|list|triage|summarize|lire|boîte|boite)\b",
            prompt_lower,
        )
    )
    # Default: draft (+ list) when unspecified; send-only stays send-only.
    if not wants_send and not wants_draft and not wants_read:
        wants_draft = True
        wants_read = True

    tools: list[str] = []
    if wants_read or wants_draft:
        tools.extend(["gmail_list", "gmail_read"])
    if wants_send and not wants_draft:
        tools.append("gmail_send_message")
    else:
        if wants_draft or not wants_send:
            tools.append("gmail_create_draft")
        if wants_send:
            tools.append("gmail_send_message")
    seen: set[str] = set()
    out: list[str] = []
    for t in tools:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def extract_external_app_queries(
    prompt: str, *, llm_hints: list[str] | None = None
) -> list[str]:
    """Detect SaaS apps the user wants, including the long-tail Pipedream catalog.

    Returns search queries / preferred app slugs (deduped). Fixed native caps
    (email/calendar/docs) still win when we have first-party tools; otherwise
    these queries drive JIT Pipedream app+action search.
    """
    hay = f"{prompt or ''} {' '.join(llm_hints or [])}".lower()
    found: list[str] = []
    seen: set[str] = set()

    def _add(query: str) -> None:
        q = query.strip().lower()
        if not q or q in seen:
            return
        # Skip pure native capability words that aren't apps.
        if q in {
            "web",
            "search",
            "research",
            "knowledge",
            "rag",
            "calc",
            "calculator",
            "math",
            "writing",
            "write",
            "email",
            "mail",
            "calendar",
            "agenda",
        }:
            return
        seen.add(q)
        found.append(q)

    # Alias dictionary (multi-word first).
    for alias in sorted(_PIPEDREAM_APP_ALIASES.keys(), key=len, reverse=True):
        if alias in hay:
            _add(_PIPEDREAM_APP_ALIASES[alias])

    # Free-form LLM hints: treat unknown tokens as app search queries.
    reserved = set(_CAPABILITY_CATALOG) | {
        "web",
        "search",
        "research",
        "knowledge",
        "rag",
        "calc",
        "calculator",
        "math",
        "writing",
        "write",
        "email",
        "gmail",
        "calendar",
        "docs",
    }
    for hint in llm_hints or []:
        h = str(hint).strip().lower()
        if not h or h in reserved:
            continue
        if h in _PIPEDREAM_APP_ALIASES:
            _add(_PIPEDREAM_APP_ALIASES[h])
        else:
            # "notion create page" → prefer first token as app
            token = re.split(r"[\s:/]+", h)[0]
            if token in _PIPEDREAM_APP_ALIASES:
                _add(_PIPEDREAM_APP_ALIASES[token])
            elif len(token) >= 3:
                _add(token)

    return found[:12]


def _intent_verbs(prompt_lower: str) -> list[str]:
    verbs: list[str] = []
    mapping = [
        (r"\b(send|envoie|envoyer|post|message|notify)\b", "send"),
        (r"\b(create|créer|creer|add|ajouter|new)\b", "create"),
        (r"\b(update|mettre à jour|append|edit|modify)\b", "update"),
        (r"\b(list|lire|read|get|fetch|search|find)\b", "list"),
        (r"\b(delete|remove|supprimer)\b", "delete"),
    ]
    for pattern, verb in mapping:
        if re.search(pattern, prompt_lower):
            verbs.append(verb)
    return verbs or ["create", "send", "list"]


async def resolve_pipedream_app(
    *,
    app_query: str,
    prompt: str,
    registry: Any,
    search: Any,
    add_binding: Any,
    ambiguous: list[dict[str, Any]],
    max_actions: int = 2,
) -> str | None:
    """JIT-resolve a Pipedream app + top actions. Returns resolved app_id or None."""
    from agent_service.integrations.pipedream import PipedreamToolProvider

    pd = registry.get_provider("pipedream") if hasattr(registry, "get_provider") else None
    if pd is None:
        pd = PipedreamToolProvider()

    apps: list[dict[str, Any]] = []
    try:
        apps = await pd.search_apps(app_query, limit=5)
    except Exception:  # noqa: BLE001
        logger.exception("pipedream_search_apps_failed query=%s", app_query)

    app_id: str | None = None
    if apps:
        # Prefer exact slug / name match.
        q = app_query.lower().replace(" ", "_")
        aliases = {
            "slack": {"slack_v2", "slack"},
            "slack_v2": {"slack_v2"},
        }
        preferred = aliases.get(q, {q})
        for row in apps:
            slug = str(row.get("app_id") or "").lower()
            name = str(row.get("name") or "").lower()
            if slug in preferred or slug == q or slug == app_query.lower() or name == app_query.lower():
                # Prefer non-bot Slack workspace app when several match.
                if "slack" in preferred and slug == "slack_bot" and any(
                    str(r.get("app_id") or "").lower() == "slack_v2" for r in apps
                ):
                    continue
                app_id = str(row.get("app_id") or slug)
                break
        if not app_id:
            # Prefer slack_v2 over slack_bot for generic slack queries.
            if q in {"slack", "slack_v2"}:
                for row in apps:
                    if str(row.get("app_id") or "").lower() == "slack_v2":
                        app_id = "slack_v2"
                        break
            if not app_id:
                app_id = str(apps[0].get("app_id") or apps[0].get("name") or "") or None

    if not app_id:
        # Fall back to action search with the raw query.
        matches = await search(app_query, limit=8)
        pd_matches = [m for m in matches if getattr(m, "provider", None) == "pipedream"]
        if not pd_matches:
            ambiguous.append(
                {
                    "capability": f"ext:{app_query}",
                    "reason": "no_match",
                    "choices": [],
                    "app_query": app_query,
                }
            )
            return None
        for tool in pd_matches[:max_actions]:
            add_binding(_binding_from_catalog(tool))
        return getattr(pd_matches[0], "provider_app_id", None)

    verbs = _intent_verbs((prompt or "").lower())
    action_query = f"{app_id} {verbs[0]}"
    matches = await search(action_query, limit=10)
    pd_matches = [
        m
        for m in matches
        if getattr(m, "provider", None) == "pipedream"
        and (
            not getattr(m, "provider_app_id", None)
            or str(m.provider_app_id).lower() in {app_id.lower(), app_query.lower()}
        )
    ]
    if not pd_matches:
        # Broader search
        matches = await search(app_id, limit=10)
        pd_matches = [m for m in matches if getattr(m, "provider", None) == "pipedream"]

    if not pd_matches:
        ambiguous.append(
            {
                "capability": f"ext:{app_id}",
                "reason": "no_actions",
                "choices": [],
                "app_id": app_id,
            }
        )
        # Still emit a connection requirement via a synthetic binding placeholder?
        return app_id

    # Auto-bind top actions (clear intent); keep extras in ambiguous for UI.
    for tool in pd_matches[:max_actions]:
        add_binding(_binding_from_catalog(tool))
    if len(pd_matches) > max_actions:
        ambiguous.append(
            {
                "capability": f"ext:{app_id}",
                "reason": "multiple_matches",
                "choices": [m.brief() for m in pd_matches[:8]],
                "app_id": app_id,
            }
        )
    return app_id


def _binding_from_catalog(tool: Any) -> ToolBinding:
    approval = getattr(tool, "approval_mode", None) or "never"
    if approval not in ("never", "always", "conditional"):
        approval = "conditional" if getattr(tool, "side_effect", False) else "never"
    return ToolBinding(
        tool_id=tool.tool_id,
        provider=getattr(tool, "provider", None) or "native",
        app_id=getattr(tool, "provider_app_id", None),
        external_action_id=getattr(tool, "provider_tool_id", None),
        version=getattr(tool, "version", None),
        enabled=True,
        approval_mode=approval,
    )


async def resolve_tools_for_capabilities(
    capabilities: list[Capability],
    *,
    registry: Any | None = None,
    prompt: str = "",
    llm_hints: list[str] | None = None,
    plan: CapabilityPlan | None = None,
) -> tuple[list[ToolBinding], list[ConnectionRequirement], list[dict[str, Any]]]:
    """Resolve capabilities → ToolBindings + ConnectionRequirements + ambiguous choices.

    Prefers native providers; auto-binds Pipedream apps for any SaaS the user names
    (Notion, Stripe, Slack, Sheets, … — full Connect catalog via JIT search).
    """
    from agent_service.integrations.registry import get_provider_registry

    reg = registry or get_provider_registry()
    # Prefer registry.search if present (alias), else search_tools.
    search = getattr(reg, "search", None) or reg.search_tools

    active_plan = plan or build_capability_plan(prompt, llm_hints=llm_hints)
    if not capabilities:
        capabilities = active_plan.to_capabilities()

    lower = (prompt or "").lower()
    selected: list[ToolBinding] = []
    seen_ids: set[str] = set()
    ambiguous: list[dict[str, Any]] = []
    for item in active_plan.ambiguities:
        if item == "email_provider":
            ambiguous.append(
                {
                    "capability": "email",
                    "reason": "ambiguous_provider",
                    "group": "email",
                    "choices": [
                        {"tool_id": "gmail", "name": "Gmail (Google)"},
                        {"tool_id": "microsoft_outlook", "name": "Outlook"},
                    ],
                }
            )
        elif item == "crm_provider":
            ambiguous.append(
                {
                    "capability": "crm",
                    "reason": "ambiguous_provider",
                    "group": "crm",
                    "choices": [
                        {"tool_id": "hubspot", "name": "HubSpot"},
                        {"tool_id": "salesforce", "name": "Salesforce"},
                        {"tool_id": "pipedrive", "name": "Pipedrive"},
                        {"tool_id": "zoho_crm", "name": "Zoho CRM"},
                    ],
                }
            )

    def _add_binding(binding: ToolBinding) -> None:
        if binding.tool_id in seen_ids:
            return
        seen_ids.add(binding.tool_id)
        selected.append(binding)

    # Always include builtins (writing-only and everything else).
    for bid in _BUILTIN_TOOL_IDS:
        tool = await reg.get_tool(bid)
        if tool:
            _add_binding(_binding_from_catalog(tool))
        else:
            _add_binding(ToolBinding(tool_id=bid, provider="native"))

    cap_ids = {c.id for c in capabilities}
    external_apps = extract_external_app_queries(prompt, llm_hints=llm_hints)
    for planned in active_plan.capabilities:
        if planned.preferred_app and planned.preferred_app not in external_apps:
            if planned.provider_preference == "pipedream" or planned.id.startswith("ext:"):
                external_apps.append(planned.preferred_app)

    prefer_outlook = any(
        p.preferred_app in {"outlook", "microsoft_outlook"}
        for p in active_plan.capabilities
    )

    # Writing-only → builtins only (no integrations + no external apps).
    integration_ids = {
        "email",
        "calendar",
        "research",
        "knowledge",
        "google_docs",
        "slack",
        "calculator",
    }
    if (
        (cap_ids == {"writing"} or cap_ids <= {"writing"})
        and not (cap_ids & integration_ids)
        and not external_apps
    ):
        return selected[:20], [], ambiguous

    async def _resolve_preferred(tool_ids: list[str]) -> None:
        for tid in tool_ids:
            tool = await reg.get_tool(tid)
            if tool:
                _add_binding(_binding_from_catalog(tool))
                continue
            matches = await search(tid, limit=5)
            native = [m for m in matches if m.provider == "native"]
            pool = native or matches
            if len(pool) == 1:
                _add_binding(_binding_from_catalog(pool[0]))
            elif len(pool) > 1:
                ambiguous.append(
                    {
                        "capability": tid,
                        "reason": "multiple_matches",
                        "choices": [m.brief() for m in pool[:8]],
                    }
                )

    if "email" in cap_ids and not prefer_outlook:
        await _resolve_preferred(_email_tool_ids(lower))

    if "calendar" in cap_ids:
        cal_ids = ["calendar_list"]
        if re.search(
            r"\b(create|book|schedule|ajouter|créer|creer|meeting|rdv|appointment)\b",
            lower,
        ):
            cal_ids.append("calendar_create_event")
        await _resolve_preferred(cal_ids)

    if "google_docs" in cap_ids:
        await _resolve_preferred(["google_docs_create", "google_docs_append"])

    if "research" in cap_ids:
        await _resolve_preferred(["web_search", "fetch_url"])

    if "knowledge" in cap_ids:
        await _resolve_preferred(["knowledge_search"])

    if "calculator" in cap_ids:
        await _resolve_preferred(["calculator"])

    # Long-tail: any SaaS via Pipedream (Slack, Notion, Stripe, Sheets, … + 3000 apps).
    # Prefer first-party Google Gmail/Calendar/Docs when those caps already resolved.
    skip_pd = set()
    if "email" in cap_ids and not prefer_outlook:
        skip_pd.update({"gmail", "email", "mail"})
    if "calendar" in cap_ids:
        skip_pd.update({"google_calendar", "calendar"})
    if "google_docs" in cap_ids:
        skip_pd.update({"google_docs", "docs"})
    if "slack" in cap_ids and "slack" not in external_apps:
        external_apps = ["slack", *external_apps]
    if prefer_outlook and "microsoft_outlook" not in external_apps:
        external_apps = ["microsoft_outlook", *external_apps]

    for app_query in external_apps:
        if app_query in skip_pd:
            continue
        await resolve_pipedream_app(
            app_query=app_query,
            prompt=prompt,
            registry=reg,
            search=search,
            add_binding=_add_binding,
            ambiguous=ambiguous,
            max_actions=2,
        )

    # Build connection requirements for OAuth / connection_required tools.
    by_key: dict[str, ConnectionRequirement] = {}
    for binding in selected:
        tool = await reg.get_tool(binding.tool_id)
        needs_conn = False
        provider_name = binding.provider or "native"
        app_slug = binding.app_id
        if tool is not None:
            needs_conn = bool(tool.connection_required)
            provider_name = tool.provider or provider_name
            app_slug = tool.provider_app_id or app_slug
        elif provider_name == "pipedream" or str(binding.tool_id).startswith("pd:"):
            needs_conn = True
        if not needs_conn:
            continue

        if provider_name == "pipedream" or str(binding.tool_id).startswith("pd:"):
            conn_provider = "pipedream"
            app_key = app_slug or "pipedream"
        elif app_slug in {"google", "gmail", "calendar"} or provider_name in {
            "google",
            "gmail",
            "calendar",
        }:
            conn_provider = "google"
            app_key = "google"
        else:
            conn_provider = provider_name
            app_key = app_slug or provider_name

        key = f"{conn_provider}:{app_key}"
        if key not in by_key:
            req_id = f"req_{uuid.uuid4().hex[:10]}"
            by_key[key] = ConnectionRequirement(
                id=req_id,
                provider=conn_provider,
                app_id=app_key,
                auth_type="oauth2",
                tool_ids=[binding.tool_id],
                required_for=[binding.tool_id],
                required=True,
            )
        else:
            req = by_key[key]
            if binding.tool_id not in req.tool_ids:
                req.tool_ids.append(binding.tool_id)
                req.required_for.append(binding.tool_id)
        binding.connection_requirement_id = by_key[key].id
        binding.app_id = binding.app_id or app_key
        if conn_provider == "pipedream":
            binding.provider = "pipedream"

    requirements = list(by_key.values())
    return selected[:20], requirements, ambiguous
