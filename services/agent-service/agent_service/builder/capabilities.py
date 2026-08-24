"""Builder capability extraction and tool resolution (hybrid integrations)."""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from pydantic import BaseModel, Field

from agent_service.models.agent_spec import (
    MAX_AGENT_TOOLS,
    ConnectionRequirement,
    ToolBinding,
)

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
    "google sheet": "google_sheets",
    "google drive": "google_drive",
    "google maps": "google_maps",
    "google map": "google_maps",
    "pappers": "pappers",
    "pappers.com": "pappers",
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
    # Design-tool phrasing (FR/EN) → real Canva, never Canvas LMS / GoCanvas.
    "canva design": "canva",
    "canva presentation": "canva",
    "présentation canva": "canva",
    "presentation canva": "canva",
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

# Max Pipedream actions bound per connected app during builder resolution.
#: Actions to bind per app. Eight meant a "add a row and post a message" agent
#: arrived with eight Airtable actions including delete-record, and a setup card
#: that added up all of their required settings. Three covers read, write and
#: update; anything else the agent needs, it says so and the user adds it in
#: Build — a short list the person can read beats a long one they cannot.
DEFAULT_PIPEDREAM_MAX_ACTIONS = 3
#: Maps research genuinely needs search plus details.
MAPS_PIPEDREAM_MAX_ACTIONS = 4
# Single source of truth — AgentSpec.tools rejects anything beyond this cap.
MAX_SELECTED_TOOLS = MAX_AGENT_TOOLS
# Key = user query (normalized slug); value = slugs that must not win by default.
_CONFUSABLE_APP_NEIGHBORS: dict[str, set[str]] = {
    "canva": {"canvas", "gocanvas", "go_canvas", "go-canvas", "instructure_canvas"},
    "canvas": {"canva", "gocanvas", "go_canvas"},
    "gocanvas": {"canva", "canvas"},
    "notion": {"notione", "notion_mail"},
    "linear": {"linear_app"},
    "stripe": {"stripes"},
}

# Blocking ambiguity reasons that must stop the build and ask the user.
BLOCKING_AMBIGUITY_REASONS = frozenset(
    {"ambiguous_app", "ambiguous_provider", "no_match"}
)

# Capability id → search / preferred native tool ids
_CAPABILITY_CATALOG: dict[str, dict[str, Any]] = {
    "email": {
        "name": "Email / Gmail",
        "description": "Read, draft, or send email via Gmail.",
        "keywords": [
            "email",
            "gmail",
            "inbox",
            "courriel",
            "e-mail",
            "courrier",
            "mails",
            "send email",
            "envoyer un email",
            "envoyer un mail",
            "envoie un email",
            "envoie un mail",
            "envoie des mails",
            "envoyer des mails",
            "boite mail",
            "boîte mail",
            "messagerie",
            # "automatiquement" / "automatically" used to live here. They say
            # nothing about email — every agent that "se déclenche
            # automatiquement" was offered Gmail and its owner had to decline it.
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
            # A bare "event" matched our own trigger note — "Event trigger: New
            # Message on app discord" — and offered Calendar to an agent that
            # watches a chat room. An event needs a calendar beside it to count.
            "calendar event",
            "événement d'agenda",
            "evenement d'agenda",
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
    mentions_email = bool(
        re.search(r"\b(email|emails|mail|mails|e-mail|courriel|courriels)\b", lower)
    )
    mentions_gmail = "gmail" in lower or "google mail" in lower
    mentions_outlook = "outlook" in lower or "microsoft mail" in lower
    # "envoie-lui une relance par email via SendGrid" names its sender; the
    # word "email" alone must not also drag Gmail into the review card.
    if (
        mentions_email
        and not mentions_gmail
        and not mentions_outlook
        and not names_its_own_email_provider(lower)
    ):
        if not any(a in {"gmail", "microsoft_outlook", "outlook"} for a in apps):
            # Email automation prompts default to Gmail — OAuth via Pipedream Connect.
            if re.search(
                r"\b(automat|automatic|envoi|envoie|envoyer|send|dispatch|agent)\b", lower
            ):
                apps.append("gmail")
            else:
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
                # Connect via Pipedream; runtime keeps first-party Gmail tools.
                provider_pref = "pipedream"
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
            # Connect via Pipedream (per-app Google account); keep native Calendar tools.
            provider_pref = "pipedream"
            intent = (
                "create"
                if re.search(r"\b(create|book|schedule|ajouter|créer|creer)\b", lower)
                else "list"
            )
        elif cap.id == "google_docs":
            preferred = "google_docs"
            provider_pref = "pipedream"
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


#: Apps that send or read mail. When the mission names one of them, the generic
#: "email" keyword must not also drag in Gmail: a prompt saying "envoie-la par
#: email avec SendGrid" arrived with both, and the person had to refuse one.
_EMAIL_PROVIDER_SLUGS: frozenset[str] = frozenset({
    "sendgrid", "mailgun", "postmark", "brevo", "sendinblue", "mailchimp",
    "mailjet", "amazon_ses", "resend", "microsoft_outlook", "outlook",
    "zoho_mail", "front", "sparkpost", "loops", "customer_io",
})


def names_its_own_email_provider(prompt: str) -> bool:
    """True when the mission already says which service sends the mail."""
    hay = (prompt or "").lower()
    for slug in _EMAIL_PROVIDER_SLUGS:
        needle = slug.replace("_", " ")
        if needle in hay or slug in hay:
            return True
    return False


def _email_tool_ids(prompt_lower: str) -> list[str]:
    # Someone who named SendGrid does not also want Gmail.
    if names_its_own_email_provider(prompt_lower):
        return []

    """Bind read/draft/send from intent. Automation agents get send by default."""
    wants_send = bool(
        re.search(
            r"\b(send|envoie|envoyer|dispatch|post|publier|publish|tweet)\b",
            prompt_lower,
        )
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
    wants_automation = bool(
        re.search(r"\b(automat|automatic|automatiquement|trigger|d[eé]clench)\b", prompt_lower)
    )
    mentions_email = bool(
        re.search(r"\b(email|emails|mail|mails|gmail|courriel|courriels)\b", prompt_lower)
    )

    if wants_automation and mentions_email:
        wants_send = True
        wants_read = True
        wants_draft = True
    elif not wants_send and not wants_draft and not wants_read:
        if mentions_email:
            # Email agent without explicit read/draft/send → full mailbox + send.
            wants_send = True
            wants_read = True
            wants_draft = True
        else:
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


def _native_capability_words() -> set[str]:
    """Words that name something the platform already does itself.

    The builder asked which SaaS app provides "current datetime" — a tool
    Stack32 ships natively and the agent already had. Deriving this from the
    native catalogue keeps it true as that catalogue grows, instead of a list
    that silently falls behind.
    """
    from agent_service.integrations.native.provider import _NATIVE_BY_ID

    words: set[str] = set()
    for tool_id in _NATIVE_BY_ID:
        compact = str(tool_id).lower()
        words.add(compact)
        words.add(compact.replace("_", " "))
        words.add(compact.replace("_", ""))
        words.update(part for part in compact.split("_") if len(part) > 2)
    return words


def extract_external_app_queries(
    prompt: str, *, llm_hints: list[str] | None = None
) -> list[str]:
    """Detect SaaS apps the user wants, including the long-tail Pipedream catalog.

    Returns search queries / preferred app slugs (deduped). Fixed native caps
    (email/calendar/docs) still win when we have first-party tools; otherwise
    these queries drive JIT Pipedream app+action search.
    """
    hay = f"{prompt or ''} {' '.join(llm_hints or [])}".lower()
    skip_postgres_alias = is_platform_postgres_noise(hay)
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
        slug = _PIPEDREAM_APP_ALIASES[alias]
        if skip_postgres_alias and slug in _PLATFORM_DATABASE_APP_SLUGS:
            continue
        if _database_alias_blocked(hay, slug):
            continue
        if alias in hay:
            _add(slug)

    # Free-form LLM hints: treat unknown tokens as app search queries.
    reserved = set(_CAPABILITY_CATALOG) | _native_capability_words() | {
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
            if token in reserved:
                continue
            if token in _PIPEDREAM_APP_ALIASES:
                _add(_PIPEDREAM_APP_ALIASES[token])
            elif len(token) >= 3:
                _add(token)

    return found[:12]


_PLATFORM_POSTGRES_MARKERS = (
    "checkpointer",
    "search_path",
    "unrecognized configuration parameter",
    "failed to initialize postgres checkpointer",
)

_PLATFORM_DATABASE_APP_SLUGS = frozenset(
    {
        "postgresql",
        "postgres",
        "supabase",
        "mysql",
        "mongodb",
        "snowflake",
    }
)

_NEGATED_DATABASE_RE = re.compile(
    r"(?:never|ne\s+pas|do\s+not|don't|omit|jamais|pas\s+ajouter|ne\s+jamais)"
    r"[^.\n]{0,120}\b(postgres(?:ql)?|supabase|mysql|mongodb|snowflake)\b",
    re.I,
)


def is_platform_postgres_noise(text: str) -> bool:
    """True when 'postgres' appears because of Stack32 internals, not a user app."""
    hay = (text or "").lower()
    return any(marker in hay for marker in _PLATFORM_POSTGRES_MARKERS)


def is_live_tool_repair_prompt(text: str) -> bool:
    return "STACK32 LIVE TOOL REPAIR" in (text or "").upper()


def _database_slug_from_binding(binding: ToolBinding) -> str:
    app = _normalize_app_slug(binding.app_id or _app_slug_from_tool_id(binding.tool_id) or "")
    if app in _PLATFORM_DATABASE_APP_SLUGS:
        return app
    tid = (binding.tool_id or "").lower()
    for slug in _PLATFORM_DATABASE_APP_SLUGS:
        if slug in tid:
            return slug
    return ""


def is_platform_database_tool(binding: ToolBinding) -> bool:
    return bool(_database_slug_from_binding(binding))


def is_postgres_user_tool(tool_id: str) -> bool:
    return "postgres" in (tool_id or "").lower()


def _database_alias_blocked(hay: str, slug: str) -> bool:
    """Skip DB apps mentioned only as forbidden platform internals."""
    if slug not in _PLATFORM_DATABASE_APP_SLUGS:
        return False
    if is_platform_postgres_noise(hay):
        return True
    if _NEGATED_DATABASE_RE.search(hay):
        return True
    if is_live_tool_repair_prompt(hay):
        return True
    return False


_REMOVE_VERB_RE = re.compile(
    r"(?:enleve(?:r|z)?|retir(?:e|er|ez)|supprim(?:e|er|ez)|remove|delete|drop)\s+"
    r"(?:moi\s+)?(?:le\s+|la\s+|l['’])?",
    re.I,
)
_NEGATE_APP_RE = re.compile(
    r"(?:pas(?:\s+besoin)?\s+de|sans|without|do\s*not\s+(?:add|use)|don't\s+(?:add|use))\s+",
    re.I,
)


def _normalize_prompt_for_intent(text: str) -> str:
    hay = (text or "").lower()
    return (
        hay.replace("ève", "eve")
        .replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
    )


def apps_user_asked_to_remove(text: str) -> set[str]:
    """Apps the user wants gone. Mentioning Postgres to remove it is not a request to add it."""
    hay = _normalize_prompt_for_intent(text)
    if not hay:
        return set()
    found: set[str] = set()
    for alias in sorted(_PIPEDREAM_APP_ALIASES.keys(), key=len, reverse=True):
        slug = _PIPEDREAM_APP_ALIASES[alias]
        if re.search(_REMOVE_VERB_RE.pattern + re.escape(alias), hay):
            found.add(slug)
        elif re.search(_NEGATE_APP_RE.pattern + re.escape(alias), hay):
            found.add(slug)
    return found


def _tool_matches_removed_app(tool: ToolBinding, removed: set[str]) -> bool:
    tid = (tool.tool_id or "").lower()
    app = _normalize_app_slug(tool.app_id or "") or (_app_slug_from_tool_id(tool.tool_id) or "")
    for slug in removed:
        if app == slug or slug in tid:
            return True
        if slug in {"postgresql", "postgres"} and "postgres" in tid:
            return True
    return False


def drop_removed_tools(tools: list[ToolBinding], *, prompt: str) -> list[ToolBinding]:
    removed = apps_user_asked_to_remove(prompt)
    if not removed:
        return tools
    return [t for t in tools if not _tool_matches_removed_app(t, removed)]


def user_requested_database_app(text: str) -> bool:
    """User explicitly asked for a database app — not a platform checkpointer error."""
    if is_platform_postgres_noise(text) or is_live_tool_repair_prompt(text):
        return False
    removed = apps_user_asked_to_remove(text)
    if removed & _PLATFORM_DATABASE_APP_SLUGS:
        return False
    return bool(
        re.search(
            r"\b(postgres(?:ql)?|supabase|mysql|mongodb|snowflake)\b",
            (text or "").lower(),
        )
    )


def filter_unsolicited_database_tools(
    tools: list[ToolBinding],
    *,
    prompt: str,
    keep_app_ids: set[str] | None = None,
) -> list[ToolBinding]:
    """Drop Postgres/Supabase/MySQL/… tools unless the user actually asked for a database."""
    tools = drop_removed_tools(tools, prompt=prompt)
    if user_requested_database_app(prompt):
        return tools
    keep = {_normalize_app_slug(a) for a in (keep_app_ids or set()) if a}
    if not keep:
        return [t for t in tools if not is_platform_database_tool(t)]
    out: list[ToolBinding] = []
    for binding in tools:
        if not is_platform_database_tool(binding):
            out.append(binding)
            continue
        app = _database_slug_from_binding(binding)
        if app in keep:
            out.append(binding)
    return out

def _intent_verbs(prompt_lower: str) -> list[str]:
    verbs: list[str] = []
    # French carries most of these missions and was largely missing: "surveille
    # ma boîte, détecte les prospects, rédige un brouillon" matched no verb at
    # all, so the plan fell back to its defaults and searched the bare app name.
    mapping = [
        (r"\b(draft|brouillon|rédige|redige|rédiger|rediger|compose|prépare|prepare)\b", "draft"),
        (r"\b(create|créer|creer|crée|cree|add|ajouter|new|génér|gener|présentation|presentation|design|slide)\b", "create"),
        (r"\b(send|envoie|envoyer|post|message|notify|répond|repond|répondre|repondre|reply)\b", "send"),
        (r"\b(update|mettre à jour|append|edit|modify|modifie|met à jour)\b", "update"),
        (
            r"\b(list|lire|lis|read|get|fetch|search|find|cherche|recherche|rechercher|"
            r"surveille|surveiller|détecte|detecte|détecter|detecter|consulte|consulter|"
            r"analyse|analyser|trie|trier)\b",
            "find",
        ),
        (r"\b(delete|remove|supprimer|supprime|archive|archiver)\b", "delete"),
    ]
    for pattern, verb in mapping:
        if re.search(pattern, prompt_lower):
            verbs.append(verb)
    # Prefer create for design/docs apps when nothing matched.
    return verbs or ["find", "create", "send"]


def _app_slug_from_tool_id(tool_id: str | None) -> str | None:
    """Derive Pipedream app slug from tool id like pd:canva-create-design → canva."""
    tid = str(tool_id or "").strip().lower()
    if not tid:
        return None
    tid = tid.removeprefix("pd:").removeprefix("pipedream:")
    if not tid:
        return None
    # Component keys are typically `{app}-{action-words}`.
    slug = tid.split("-")[0].strip()
    return slug or None


def _tool_belongs_to_app(tool: Any, app_id: str) -> bool:
    """Strict membership: exact provider_app_id OR exact pd:{app}-* tool id prefix.

    Never treat empty provider_app_id as a match — that caused Canva→Canvas/GoCanvas.
    Never accept confusable neighbor slugs (canvas/gocanvas for canva).
    """
    app = _normalize_app_slug(app_id)
    if not app:
        return False
    neighbors = set(_CONFUSABLE_APP_NEIGHBORS.get(app, set()))
    pid = _normalize_app_slug(str(getattr(tool, "provider_app_id", None) or ""))
    tid = str(getattr(tool, "tool_id", None) or "").lower()
    derived = _app_slug_from_tool_id(tid)

    if pid and pid in neighbors:
        return False
    if derived and derived in neighbors:
        return False
    if pid == app:
        return True
    if derived == app:
        return True
    if tid.startswith(f"pd:{app}-") or tid.startswith(f"pipedream:{app}-"):
        return True
    return False


def _filter_actions_for_app(tools: list[Any], app_id: str) -> list[Any]:
    return [m for m in tools if _tool_belongs_to_app(m, app_id)]


#: Verbs that take something away. An agent asked to add a row should not
#: arrive holding delete-record: it is one hallucinated argument away from
#: destroying the user's data, and it never earned its place in the list.
_DESTRUCTIVE_VERBS: tuple[str, ...] = (
    "delete", "remove", "archive", "trash", "purge", "revoke", "cancel",
    "unpublish", "clear", "reset", "supprime",
)


def _asks_to_destroy(prompt_lower: str) -> bool:
    """True when the mission itself calls for taking something away."""
    return bool(
        re.search(
            r"\b(supprim\w*|efface\w*|archiv\w*|retire\w*|delete|remove|archive|clean\s*up)\b",
            prompt_lower,
        )
    )


def drop_unrequested_destructive_actions(tools: list[Any], prompt_lower: str) -> list[Any]:
    """Leave destructive actions out unless the mission asked for one.

    Keeps at least one tool: if every candidate destroys something, the mission
    is about destroying something even when the wording did not say so.
    """
    if not tools or _asks_to_destroy(prompt_lower):
        return tools

    def _destroys(tool: Any) -> bool:
        tid = str(getattr(tool, "tool_id", None) or "").lower()
        action = tid.split("-", 1)[1] if "-" in tid else tid
        return any(action.startswith(v) or f"-{v}-" in f"-{action}-" for v in _DESTRUCTIVE_VERBS)

    kept = [t for t in tools if not _destroys(t)]
    return kept or tools


def _prefer_action_tools(tools: list[Any], prompt_lower: str) -> list[Any]:
    """Rank create/design, outbound (send/post), or Maps actions first when relevant."""
    if not tools:
        return tools

    wants_outbound = bool(
        re.search(
            r"\b(send|envoie|envoyer|post|publier|publish|tweet|share|notify|message|social|réseau|reseau)\b",
            prompt_lower,
        )
    )
    if wants_outbound:

        def _outbound_score(tool: Any) -> int:
            tid = str(getattr(tool, "tool_id", None) or "").lower()
            name = str(getattr(tool, "name", None) or "").lower()
            hay = f"{tid} {name}"
            score = 0
            for kw in (
                "send",
                "post",
                "publish",
                "tweet",
                "create-tweet",
                "share",
                "message",
                "reply",
                "dm",
            ):
                if kw in hay:
                    score += 70
            for kw in ("list", "get", "search", "read", "find", "lookup"):
                if kw in hay:
                    score -= 25
            return score

        return sorted(tools, key=_outbound_score, reverse=True)

    mapsish = any(
        "google_maps" in str(getattr(t, "tool_id", "") or "").lower()
        or "maps_platform" in str(getattr(t, "tool_id", "") or "").lower()
        or str(getattr(t, "provider_app_id", "") or "").lower()
        in {"google_maps", "google_maps_platform"}
        for t in tools
    )
    if mapsish or "google maps" in prompt_lower or "google_maps" in prompt_lower:

        def _maps_score(tool: Any) -> int:
            tid = str(getattr(tool, "tool_id", None) or "").lower()
            name = str(getattr(tool, "name", None) or "").lower()
            hay = f"{tid} {name}"
            score = 0
            if "search-places" in hay or "search_places" in hay or "search places" in hay:
                score += 80
            if "place-details" in hay or "place_details" in hay or "get-place" in hay:
                score += 75
            if "text-search" in hay or "nearby" in hay:
                score += 40
            if "fetch" in hay or "scrape" in hay:
                score -= 50
            return score

        return sorted(tools, key=_maps_score, reverse=True)

    wants_create = bool(
        re.search(
            r"\b(create|créer|creer|crée|cree|design|présentation|presentation|slide|page|génér|gener)\b",
            prompt_lower,
        )
    )
    if not wants_create:
        return tools

    def _score(tool: Any) -> int:
        tid = str(getattr(tool, "tool_id", None) or "").lower()
        name = str(getattr(tool, "name", None) or "").lower()
        hay = f"{tid} {name}"
        score = 0
        if "create" in hay or "design" in hay:
            score += 50
        if "export" in hay or "upload" in hay:
            score += 20
        if "list" in hay or "option" in hay:
            score -= 30
        if "update" in hay:
            score += 10
        return score

    return sorted(tools, key=_score, reverse=True)


def _normalize_app_slug(value: str) -> str:
    return re.sub(r"[\s\-]+", "_", (value or "").strip().lower())


def slug_from_website(url: str) -> str | None:
    """Map a tool website (canva.com) to a Pipedream app slug hint."""
    from urllib.parse import urlparse

    raw = (url or "").strip()
    if not raw:
        return None
    if not re.match(r"^https?://", raw, re.I):
        raw = "https://" + raw
    try:
        host = (urlparse(raw).hostname or "").lower()
    except Exception:  # noqa: BLE001
        return None
    host = host.removeprefix("www.")
    if not host:
        return None
    root = host.split(".")[0]
    if not root or len(root) < 3:
        return None
    if root in _PIPEDREAM_APP_ALIASES:
        return _PIPEDREAM_APP_ALIASES[root]
    alias_values = set(_PIPEDREAM_APP_ALIASES.values())
    if root in alias_values:
        return root
    return root


def _app_choice_row(row: dict[str, Any]) -> dict[str, str]:
    slug = str(row.get("app_id") or row.get("name") or "").strip()
    name = str(row.get("name") or slug).strip()
    return {"tool_id": slug, "app_id": slug, "name": name or slug}


def _score_pipedream_app(query: str, row: dict[str, Any]) -> int:
    """Higher is better. Exact slug/name wins; confusable neighbors are penalized."""
    q = _normalize_app_slug(query)
    q_raw = (query or "").strip().lower()
    alias_target = _PIPEDREAM_APP_ALIASES.get(q_raw) or _PIPEDREAM_APP_ALIASES.get(
        q.replace("_", " ")
    )
    preferred = {q, q_raw.replace(" ", "_")}
    if alias_target:
        preferred.add(alias_target)
    if q in {"slack", "slack_v2"}:
        preferred.update({"slack", "slack_v2"})

    slug = _normalize_app_slug(str(row.get("app_id") or ""))
    name = str(row.get("name") or "").strip().lower()
    neighbors = set()
    for key in preferred:
        neighbors |= _CONFUSABLE_APP_NEIGHBORS.get(key, set())

    if slug in neighbors:
        return -100
    if slug in preferred or name == q_raw or name.replace(" ", "_") in preferred:
        return 100
    if alias_target and slug == alias_target:
        return 100
    if slug.startswith(q + "_") or slug.startswith(q + "-"):
        return 40
    if q and q in slug and slug != q:
        # "canva" ⊂ "canvas" / "gocanvas" — treat as collision, not match.
        if slug in neighbors or any(n in slug for n in neighbors):
            return -80
        return 10
    if q_raw and q_raw in name and name != q_raw:
        if any(n.replace("_", " ") in name for n in neighbors):
            return -80
        return 5
    return 0


def pick_pipedream_app(
    query: str, apps: list[dict[str, Any]]
) -> tuple[str | None, list[dict[str, Any]], str | None]:
    """Choose a Pipedream app or signal ambiguity.

    Returns (app_id | None, candidate_rows, reason | None).
    Never returns a low-confidence first-hit guess.
    """
    if not apps:
        return None, [], "no_match"

    scored: list[tuple[int, dict[str, Any]]] = []
    for row in apps:
        scored.append((_score_pipedream_app(query, row), row))
    scored.sort(key=lambda item: item[0], reverse=True)

    best_score, best = scored[0]
    positive = [(s, r) for s, r in scored if s >= 40]
    near = [(s, r) for s, r in scored if s > 0]

    q = _normalize_app_slug(query)
    neighbors = _CONFUSABLE_APP_NEIGHBORS.get(q, set())
    neighbor_hits = [
        r
        for s, r in scored
        if s < 40 and _normalize_app_slug(str(r.get("app_id") or "")) in neighbors
    ]

    # Exact / alias hit — bind only that app.
    if best_score >= 100:
        app_id = str(best.get("app_id") or best.get("name") or "") or None
        # Slack: prefer workspace app over bot when both exact-ish.
        if q in {"slack", "slack_v2"}:
            for _s, row in scored:
                if _normalize_app_slug(str(row.get("app_id") or "")) == "slack_v2":
                    return "slack_v2", [row], None
        return app_id, [best], None

    # Confusable neighbors present and no exact match → ask the user.
    if neighbor_hits or (near and best_score < 40):
        # Include best positive candidates + neighbors for the form.
        pool: list[dict[str, Any]] = []
        seen: set[str] = set()
        for _s, row in scored:
            slug = _normalize_app_slug(str(row.get("app_id") or row.get("name") or ""))
            if not slug or slug in seen:
                continue
            if _s >= 40 or slug in neighbors or _s > 0:
                seen.add(slug)
                pool.append(row)
            if len(pool) >= 6:
                break
        if not pool:
            pool = [r for _s, r in scored[:5]]
        return None, pool, "ambiguous_app"

    if positive:
        app_id = str(positive[0][1].get("app_id") or positive[0][1].get("name") or "") or None
        return app_id, [positive[0][1]], None

    # No confident match — do NOT take apps[0].
    return None, [r for _s, r in scored[:5]], "ambiguous_app"


def is_surgical_tool_edit(edit_prompt: str, *, current_tool_count: int = 0) -> bool:
    """True when the user is fixing/replacing a tool, not rewriting the whole agent."""
    text = (edit_prompt or "").strip()
    if not text:
        return False
    lower = text.lower()
    fix_markers = (
        "fix",
        "corrige",
        "wrong",
        "trompé",
        "trompe",
        "remplace",
        "replace",
        "pas le bon",
        "not the right",
        "change tool",
        "change l'outil",
        "change loutil",
        "only this",
        "juste cet",
        "juste cet outil",
        "photo",
        "logo",
        "enlève",
        "enleve",
        "remove",
        "retire",
        "supprime",
        "delete",
    )
    if any(m in lower for m in fix_markers):
        return True
    apps = extract_external_app_queries(text)
    if len(text) < 700 and 1 <= len(apps) <= 2 and current_tool_count >= 2:
        return True
    return False


def merge_tools_on_edit(
    current_tools: list[ToolBinding],
    incoming_tools: list[ToolBinding],
    *,
    edit_prompt: str,
) -> list[ToolBinding]:
    """Keep unrelated tools on MODIFY; replace only apps targeted by the edit."""
    if not current_tools:
        return incoming_tools

    apps = extract_external_app_queries(edit_prompt)
    removed = apps_user_asked_to_remove(edit_prompt)
    if removed:
        return drop_removed_tools(current_tools, prompt=edit_prompt)

    targets: set[str] = set()
    for app in apps:
        slug = _normalize_app_slug(app)
        targets.add(slug)
        targets |= set(_CONFUSABLE_APP_NEIGHBORS.get(slug, set()))
        # If user asked for canva, also purge canvas/gocanvas bindings.
        for known, neighbors in _CONFUSABLE_APP_NEIGHBORS.items():
            if slug == known or slug in neighbors:
                targets.add(known)
                targets |= set(neighbors)

    if not targets:
        return incoming_tools

    def _app_key(binding: ToolBinding) -> str:
        return _normalize_app_slug(binding.app_id or "")

    preserved = [t for t in current_tools if _app_key(t) not in targets]
    # Also drop legacy wrong bindings whose tool_id embeds a confusable slug
    # (e.g. pd:canvas-...) even if app_id was missing.
    def _tool_hits_target(tool_id: str) -> bool:
        slug = _normalize_app_slug(tool_id)
        for n in targets:
            if len(n) < 4:
                continue
            if slug == n or slug.startswith(n + "_") or f"_{n}_" in f"_{slug}_":
                return True
            # Avoid "canva" matching inside "canvas": require non-extension.
            if n in slug and not any(
                other != n and n in other and other in slug for other in targets
            ):
                # e.g. query target canva must not match tool ...canvas...
                neighbors = _CONFUSABLE_APP_NEIGHBORS.get(n, set())
                if any(neigh in slug for neigh in neighbors):
                    return False
                if re.search(rf"(^|_|:|-){re.escape(n)}($|_|:|-)", slug):
                    return True
        return False

    preserved = [t for t in preserved if not _tool_hits_target(t.tool_id)]
    replacements = [t for t in incoming_tools if _app_key(t) in targets]
    builtins = [t for t in incoming_tools if t.tool_id in _BUILTIN_TOOL_IDS]

    merged: list[ToolBinding] = []
    seen: set[str] = set()
    for binding in builtins + preserved + replacements:
        if binding.tool_id in seen:
            continue
        seen.add(binding.tool_id)
        merged.append(binding)
    return merged[:MAX_SELECTED_TOOLS]


def blocking_ambiguities(
    ambiguous: list[dict[str, Any]],
    *,
    preferred_apps: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Ambiguities that must interrupt the build until the user clarifies."""
    preferred = {_normalize_app_slug(a) for a in (preferred_apps or []) if a}
    out: list[dict[str, Any]] = []
    for item in ambiguous:
        reason = str(item.get("reason") or "")
        if reason not in BLOCKING_AMBIGUITY_REASONS:
            continue
        query = _normalize_app_slug(
            str(item.get("app_query") or item.get("app_id") or item.get("capability") or "")
            .replace("ext:", "")
        )
        if query and query in preferred:
            continue
        choice_ids = {
            _normalize_app_slug(str(c.get("tool_id") or c.get("app_id") or ""))
            for c in (item.get("choices") or [])
            if isinstance(c, dict)
        }
        if preferred & choice_ids:
            continue
        group = str(item.get("group") or "")
        if group and any(
            p in preferred
            for p in (
                ({"gmail", "microsoft_outlook"} if group == "email" else set())
                | (
                    {"hubspot", "salesforce", "pipedrive", "zoho_crm"}
                    if group == "crm"
                    else set()
                )
            )
        ):
            continue
        out.append(item)
    return out


async def build_connection_requirements(
    selected: list[ToolBinding],
    *,
    registry: Any | None = None,
) -> list[ConnectionRequirement]:
    """Derive OAuth/connection requirements from resolved tool bindings."""
    from agent_service.integrations.registry import get_provider_registry

    reg = registry or get_provider_registry()
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
            derived = _app_slug_from_tool_id(binding.tool_id)
            app_key = app_slug or derived or "pipedream"
            if app_key in {"pipedream", "pd"} and derived:
                app_key = derived
        else:
            from agent_service.integrations.app_keys import (
                SUITE_APP_IDS,
                app_key_from_tool_id,
                oauth_provider_for_app,
            )

            app_key = app_key_from_tool_id(binding.tool_id, app_id=app_slug)
            conn_provider = oauth_provider_for_app(app_key)
            if app_key in SUITE_APP_IDS:
                app_key = app_key_from_tool_id(binding.tool_id)
                conn_provider = oauth_provider_for_app(app_key)

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
        if not binding.app_id or binding.app_id in {
            "google",
            "microsoft",
            "microsoft_365",
            "microsoft365",
        }:
            binding.app_id = app_key
        # Only mark the tool itself as Pipedream when it actually is a PD tool.
        # Native Gmail/Calendar helpers keep provider=native but still require a
        # Pipedream Connect account for that product app (per-app Google login).
        if conn_provider == "pipedream" and (
            provider_name == "pipedream" or str(binding.tool_id).startswith("pd:")
        ):
            binding.provider = "pipedream"
    return list(by_key.values())


async def resolve_pipedream_app(
    *,
    app_query: str,
    prompt: str,
    registry: Any,
    search: Any,
    add_binding: Any,
    ambiguous: list[dict[str, Any]],
    max_actions: int = DEFAULT_PIPEDREAM_MAX_ACTIONS,
) -> str | None:
    """JIT-resolve a Pipedream app + top actions. Returns resolved app_id or None.

    Never auto-binds the first arbitrary search hit when the catalog is ambiguous
    (e.g. Canva vs Canvas vs GoCanvas). Those cases are pushed to `ambiguous`
    for a Builder interrupt form.
    """
    # Second guard, deliberately close to the form: a native capability must
    # never reach the "which app is this?" question. Asking someone to name the
    # SaaS behind "current datetime" or "calculator" is asking about something
    # the platform already does, and it stops the build until they answer.
    if _normalize_app_slug(app_query) in _native_capability_words():
        logger.info("native_capability_not_an_app query=%s", app_query)
        return None

    from agent_service.integrations.pipedream import PipedreamToolProvider

    pd = registry.get_provider("pipedream") if hasattr(registry, "get_provider") else None
    if pd is None:
        pd = PipedreamToolProvider()

    apps: list[dict[str, Any]] = []
    try:
        apps = await pd.search_apps(app_query, limit=8)
    except Exception:  # noqa: BLE001
        logger.exception("pipedream_search_apps_failed query=%s", app_query)

    app_id, candidates, reason = pick_pipedream_app(app_query, apps)
    alias = _PIPEDREAM_APP_ALIASES.get(app_query.lower().strip()) or _PIPEDREAM_APP_ALIASES.get(
        _normalize_app_slug(app_query).replace("_", " ")
    )
    # Known-good aliases (canva, notion, …): prefer exact slug actions over a
    # fuzzy apps[0] neighbor, even when search_apps ranks Canvas/GoCanvas first.
    if reason in {"ambiguous_app", "no_match"} and alias:
        forced = await search(alias, limit=10)
        forced_pd = [
            m
            for m in forced
            if getattr(m, "provider", None) == "pipedream"
            and str(getattr(m, "provider_app_id", None) or "").lower() == alias
        ]
        if forced_pd:
            app_id = alias
            reason = None
            candidates = [{"app_id": alias, "name": alias.title()}]
            logger.info(
                "pipedream_app_forced_alias query=%s chosen=%s via_actions=%s",
                app_query,
                alias,
                len(forced_pd),
            )

    if reason in {"ambiguous_app", "no_match"}:
        choices = [_app_choice_row(r) for r in candidates]
        # Always offer the alias target when we know it (Canva) even if absent
        # from the current search page — user can still confirm / paste URL.
        if alias and alias not in {c["tool_id"].lower() for c in choices}:
            choices.insert(0, {"tool_id": alias, "app_id": alias, "name": alias.title()})
        ambiguous.append(
            {
                "capability": f"ext:{app_query}",
                "reason": reason,
                "choices": choices[:8],
                "app_query": app_query,
            }
        )
        logger.info(
            "pipedream_app_ambiguous query=%s reason=%s candidates=%s",
            app_query,
            reason,
            [c.get("tool_id") for c in choices[:6]],
        )
        return None

    if not app_id:
        # Action-search fallback only when a single Pipedream app is present.
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
        app_ids = {
            str(getattr(m, "provider_app_id", None) or "").lower()
            for m in pd_matches
            if getattr(m, "provider_app_id", None)
        }
        app_ids.discard("")
        if len(app_ids) != 1:
            ambiguous.append(
                {
                    "capability": f"ext:{app_query}",
                    "reason": "ambiguous_app",
                    "choices": [
                        {
                            "tool_id": aid,
                            "app_id": aid,
                            "name": aid,
                        }
                        for aid in sorted(app_ids)[:8]
                    ]
                    or [],
                    "app_query": app_query,
                }
            )
            return None
        app_id = next(iter(app_ids))
        neighbors = _CONFUSABLE_APP_NEIGHBORS.get(_normalize_app_slug(app_query), set())
        if app_id in neighbors:
            ambiguous.append(
                {
                    "capability": f"ext:{app_query}",
                    "reason": "ambiguous_app",
                    "choices": [{"tool_id": app_id, "app_id": app_id, "name": app_id}],
                    "app_query": app_query,
                }
            )
            return None

    assert app_id is not None
    logger.info("pipedream_app_resolved query=%s chosen=%s", app_query, app_id)

    prompt_lower = (prompt or "").lower()
    verbs = _intent_verbs(prompt_lower)
    # Try several action queries — wrong first verb (e.g. "send" from "envoie les infos")
    # previously returned only Gmail natives, then a loose canva search bound Canvas.
    query_attempts: list[str] = []
    for verb in verbs:
        candidate = f"{app_id} {verb}"
        if candidate not in query_attempts:
            query_attempts.append(candidate)
    for candidate in (app_id, f"{app_id} create", f"{app_id} design"):
        if candidate not in query_attempts:
            query_attempts.append(candidate)

    # Every intent the mission expresses gets its own query, and each one gets
    # its best action before any of them gets a second. Stopping at the first
    # query that returned anything is how "watch the inbox and draft a reply"
    # came back with label and signature actions and no way to read an inbox.
    ranked_per_intent: list[list[Any]] = []
    matches: list[Any] = []
    action_query = query_attempts[0]
    for action_query in query_attempts:
        matches = await search(action_query, limit=15)
        pd_raw = [m for m in matches if getattr(m, "provider", None) == "pipedream"]
        ranked = _prefer_action_tools(
            drop_unrequested_destructive_actions(
                _filter_actions_for_app(pd_raw, app_id), prompt_lower
            ),
            prompt_lower,
        )
        if ranked:
            ranked_per_intent.append(ranked)
        if sum(len(r) for r in ranked_per_intent) >= max_actions and len(
            ranked_per_intent
        ) >= min(len(verbs), len(query_attempts)):
            break

    pd_matches: list[Any] = []
    seen_action_ids: set[str] = set()
    for rank in range(max(len(r) for r in ranked_per_intent) if ranked_per_intent else 0):
        for ranked in ranked_per_intent:
            if rank >= len(ranked):
                continue
            tool_id = str(getattr(ranked[rank], "tool_id", "") or "")
            if not tool_id or tool_id in seen_action_ids:
                continue
            seen_action_ids.add(tool_id)
            pd_matches.append(ranked[rank])

    if not pd_matches:
        # Surface near-misses so the Builder can ask the user instead of binding Canvas.
        near = [
            m
            for m in matches
            if getattr(m, "provider", None) == "pipedream"
        ][:8]
        ambiguous.append(
            {
                "capability": f"ext:{app_id}",
                "reason": "ambiguous_app" if near else "no_actions",
                "choices": [
                    {
                        "tool_id": _app_slug_from_tool_id(getattr(m, "tool_id", None))
                        or app_id,
                        "app_id": _app_slug_from_tool_id(getattr(m, "tool_id", None))
                        or app_id,
                        "name": str(getattr(m, "name", None) or getattr(m, "tool_id", "")),
                    }
                    for m in near
                ]
                or [{"tool_id": app_id, "app_id": app_id, "name": app_id.title()}],
                "app_id": app_id,
                "app_query": app_query,
            }
        )
        return None

    bound_count = 0
    for tool in pd_matches[:max_actions]:
        if not _tool_belongs_to_app(tool, app_id):
            continue
        binding = _binding_from_catalog(tool)
        # Force the resolved app slug onto the binding for Structure grouping.
        binding.app_id = app_id
        binding.provider = "pipedream"
        add_binding(binding)
        bound_count += 1
    if not bound_count:
        ambiguous.append(
            {
                "capability": f"ext:{app_id}",
                "reason": "no_actions",
                "choices": [{"tool_id": app_id, "app_id": app_id, "name": app_id.title()}],
                "app_id": app_id,
                "app_query": app_query,
            }
        )
        return None
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
    # Connection/OAuth is the user's authorization — do not require per-action
    # Approve/Deny prompts at runtime by default.
    return ToolBinding(
        tool_id=tool.tool_id,
        provider=getattr(tool, "provider", None) or "native",
        app_id=getattr(tool, "provider_app_id", None),
        external_action_id=getattr(tool, "provider_tool_id", None),
        version=getattr(tool, "version", None),
        enabled=True,
        approval_mode="never",
    )


async def resolve_tools_for_capabilities(
    capabilities: list[Capability],
    *,
    registry: Any | None = None,
    prompt: str = "",
    llm_hints: list[str] | None = None,
    plan: CapabilityPlan | None = None,
    preferred_apps: list[str] | None = None,
) -> tuple[list[ToolBinding], list[ConnectionRequirement], list[dict[str, Any]]]:
    """Resolve capabilities → ToolBindings + ConnectionRequirements + ambiguous choices.

    Prefers native providers; auto-binds Pipedream apps for any SaaS the user names
    (Notion, Stripe, Slack, Sheets, … — full Connect catalog via JIT search).
    """
    from agent_service.integrations.registry import get_provider_registry

    reg = registry or get_provider_registry()
    # Prefer registry.search if present (alias), else search_tools.
    search = getattr(reg, "search", None) or reg.search_tools

    active_plan = plan or build_capability_plan(
        prompt, llm_hints=llm_hints, preferred_apps=preferred_apps
    )
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
        return selected[:MAX_SELECTED_TOOLS], [], ambiguous

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
        email_resolved = "email_provider" not in active_plan.ambiguities or any(
            a in {"gmail", "microsoft_outlook", "outlook"} for a in (preferred_apps or [])
        )
        if email_resolved:
            email_tools = _email_tool_ids(lower)
            if any(p.intent == "send" for p in active_plan.capabilities if p.id == "email"):
                if "gmail_send_message" not in email_tools:
                    email_tools.append("gmail_send_message")
            await _resolve_preferred(email_tools)

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

    # Long-tail SaaS via Pipedream (Slack, Notion, Twitter, Gmail send actions, …).
    # Do not skip connected apps — OAuth is the authorization gate; bind send/post actions.
    skip_pd: set[str] = set()
    if "crm_provider" in active_plan.ambiguities and not any(
        a in {"hubspot", "salesforce", "pipedrive", "zoho_crm", "zoho", "close", "copper"}
        for a in (preferred_apps or [])
    ):
        skip_pd.update(
            {"crm", "hubspot", "salesforce", "pipedrive", "zoho", "zoho_crm", "close", "copper"}
        )
    if "slack" in cap_ids and "slack" not in external_apps:
        external_apps = ["slack", *external_apps]
    if prefer_outlook and "microsoft_outlook" not in external_apps:
        external_apps = ["microsoft_outlook", *external_apps]

    for app_query in external_apps:
        if app_query in skip_pd:
            continue
        app_norm = _normalize_app_slug(app_query)
        maps_app = app_norm in {
            "google_maps",
            "google_maps_platform",
            "googlemaps",
        } or "google_map" in app_norm
        await resolve_pipedream_app(
            app_query=app_query,
            prompt=prompt,
            registry=reg,
            search=search,
            add_binding=_add_binding,
            ambiguous=ambiguous,
            # Maps research needs search + details (fetch_url on Maps URLs fails).
            max_actions=MAPS_PIPEDREAM_MAX_ACTIONS if maps_app else DEFAULT_PIPEDREAM_MAX_ACTIONS,
        )

    # Build connection requirements for OAuth / connection_required tools.
    requirements = await build_connection_requirements(selected, registry=reg)
    return selected[:MAX_SELECTED_TOOLS], requirements, ambiguous


#: Phrases that say "start when something happens" rather than "do this".
#: French first — the product speaks French to most of its users today.
_EVENT_OPENERS: tuple[str, ...] = (
    "chaque fois qu",
    "chaque fois que",
    "à chaque fois qu",
    "a chaque fois qu",
    "dès qu",
    "des qu",
    "dès que",
    "des que",
    "lorsqu",
    "lorsque",
    "quand",
    "sitôt qu",
    "whenever",
    "every time",
    "each time",
    "as soon as",
    "when ",
)

#: Words that mark a clock-driven start, which is a schedule and not an event.
_SCHEDULE_MARKERS: tuple[str, ...] = (
    "chaque lundi",
    "chaque mardi",
    "chaque mercredi",
    "chaque jeudi",
    "chaque vendredi",
    "chaque samedi",
    "chaque dimanche",
    "chaque matin",
    "chaque soir",
    "chaque jour",
    "chaque semaine",
    "tous les jours",
    "toutes les heures",
    "every morning",
    "every day",
    "every week",
    "every hour",
    "every monday",
)


def suggest_tool_trigger_app(prompt: str) -> str | None:
    """Name the app whose events should start the agent, when the user said so.

    "Quand une carte arrive dans mon tableau Trello, ajoute une ligne dans
    Airtable" names two apps, and only the first one is the source of the
    event — the trigger form was leaving the user to pick it by hand even
    though the sentence already said it.

    Returns an app slug, or None when the prompt does not describe an
    event-driven start. A clock-driven start ("chaque lundi matin") is a
    schedule, not a tool event, so it yields None too.
    """
    text = (prompt or "").strip().lower()
    if not text:
        return None

    opener_at = -1
    for opener in _EVENT_OPENERS:
        found = text.find(opener)
        if found != -1 and (opener_at == -1 or found < opener_at):
            opener_at = found
    if opener_at == -1:
        return None

    # The clause the opener introduces runs to the first comma or full stop —
    # past that we are in the "then do this" half, where the apps are targets.
    clause_end = len(text)
    for mark in (",", ".", ";", " puis ", " then "):
        found = text.find(mark, opener_at)
        if found != -1:
            clause_end = min(clause_end, found)
    clause = text[opener_at:clause_end]

    # A clock inside that same clause means a schedule, not a tool event.
    if any(marker in clause for marker in _SCHEDULE_MARKERS):
        return None

    # Only offer a slug the alias table vouches for. extract_external_app_queries
    # also returns free-text search queries for the long tail, and filling the
    # picker with one of those would point the event lookup at an app id that
    # does not exist — worse than leaving the field empty.
    known_slugs = set(_PIPEDREAM_APP_ALIASES.values())
    for candidate in extract_external_app_queries(clause):
        if candidate in known_slugs:
            return candidate
    return None
