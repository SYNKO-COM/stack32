"""Google Gmail + Calendar tools — credentials from ConnectionManager only."""

from __future__ import annotations

import base64
import logging
from datetime import UTC, datetime
from email.mime.text import MIMEText
from typing import Any

import httpx

from agent_service.connections.manager import ConnectionManager

logger = logging.getLogger(__name__)


def _as_rfc3339(value: str, *, default_time: str = "09:00:00") -> str:
    """Normalize LLM datetimes to RFC3339 with timezone for Google Calendar."""
    import re

    v = (value or "").strip()
    if not v:
        return v
    if re.search(r"(Z|[+-]\d{2}:?\d{2})$", v, re.I):
        return v
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return f"{v}T{default_time}Z"
    if "T" in v:
        return f"{v}Z"
    return v


async def _token(user_id: str, agent_id: str, tool_id: str | None = None) -> str | None:
    token = await ConnectionManager().resolve_access_token(
        user_id=user_id, agent_id=agent_id, provider="google", tool_id=tool_id
    )
    if token:
        return token
    # Pipedream Connect accounts for Google product apps (preferred path).
    from agent_service.integrations.app_keys import app_key_from_tool_id
    from agent_service.integrations.pipedream.accounts import resolve_pipedream_auth_for_tool
    from agent_service.integrations.pipedream.client import PipedreamClient

    app = app_key_from_tool_id(tool_id or "", app_id=None)
    if app in {"google", ""}:
        if (tool_id or "").startswith("calendar"):
            app = "google_calendar"
        elif (tool_id or "").startswith("google_docs"):
            app = "google_docs"
        else:
            app = "gmail"
    auth = await resolve_pipedream_auth_for_tool(
        user_id=user_id, agent_id=agent_id, tool_id=tool_id or "", app_id=app
    )
    if not auth:
        return None
    client = PipedreamClient()
    return await client.get_oauth_access_token_for_app(
        external_user_id=user_id,
        app=str(auth.get("app_id") or app),
        account_id=str(auth.get("auth_provision_id") or "") or None,
    )


# Curated Pipedream action keys for first-party Google tools when BYOA tokens
# are unavailable (Pipedream-managed OAuth). Tried in order.
_PD_ACTION_CANDIDATES: dict[str, list[str]] = {
    "calendar_list": [
        "google_calendar-list-events",
        "google_calendar-get-calendar",
    ],
    "calendar_create_event": [
        "google_calendar-create-event",
        "google_calendar-quick-add-event",
    ],
    "gmail_list": ["gmail-list-labels", "gmail-find-email"],
    "gmail_read": ["gmail-get-email", "gmail-find-email"],
    "gmail_create_draft": ["gmail-create-draft"],
    "gmail_send_message": ["gmail-send-email", "gmail-send-message"],
    "google_docs_create": ["google_docs-create-document", "google_docs-create-document-from-text"],
    "google_docs_append": ["google_docs-append-text", "google_docs-insert-text"],
}

# Pipedream Connect auth props use camelCase app keys (googleCalendar), not slugs.
_PD_AUTH_PROP_BY_APP: dict[str, str] = {
    "google_calendar": "googleCalendar",
    "gmail": "gmail",
    "google_docs": "googleDocs",
    "google_sheets": "googleSheets",
    "google_drive": "googleDrive",
}


def _pd_error_message(result: dict[str, Any] | None) -> str:
    if not isinstance(result, dict):
        return ""
    err = result.get("error")
    if isinstance(err, dict):
        nested = err.get("message") or err.get("msg") or err.get("name")
        if nested:
            return str(nested)[:400]
        return str(err)[:400]
    for key in ("message", "detail", "os_error"):
        if result.get(key):
            return str(result[key])[:400]
    if err:
        return str(err)[:400]
    return ""


def _props_for_pd_calendar_create(
    *,
    action_id: str,
    title: str,
    start_rfc: str,
    end_rfc: str,
    description: str,
) -> dict[str, Any]:
    """Map Stack32 calendar args onto Pipedream Google Calendar action props."""
    if action_id.endswith("quick-add-event"):
        text = f"{title} at {start_rfc}"
        if description:
            text = f"{text}. {description[:500]}"
        return {"calendarId": "primary", "text": text[:2000]}
    # google_calendar-create-event expects eventStartDate / eventEndDate strings.
    return {
        "calendarId": "primary",
        "summary": title[:500],
        "description": description[:10000],
        "eventStartDate": start_rfc,
        "eventEndDate": end_rfc,
    }


async def _try_pipedream_action(
    *,
    user_id: str,
    agent_id: str,
    tool_id: str,
    app_id: str,
    props: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Run a curated Pipedream action when Google OAuth tokens aren't in Stack32."""
    from agent_service.integrations.pipedream.accounts import resolve_pipedream_auth_for_tool
    from agent_service.integrations.pipedream.client import PipedreamClient

    auth = await resolve_pipedream_auth_for_tool(
        user_id=user_id, agent_id=agent_id, tool_id=tool_id, app_id=app_id
    )
    if not auth or not auth.get("auth_provision_id"):
        return None
    client = PipedreamClient()
    if not client.configured():
        return None
    auth_prop = _PD_AUTH_PROP_BY_APP.get(app_id) or app_id
    last_error: dict[str, Any] | None = None
    for action_id in _PD_ACTION_CANDIDATES.get(tool_id, []):
        action_props = dict(props or {})
        if tool_id == "calendar_create_event":
            action_props = _props_for_pd_calendar_create(
                action_id=action_id,
                title=str((props or {}).get("summary") or (props or {}).get("title") or "Event"),
                start_rfc=str(
                    ((props or {}).get("start") or {}).get("dateTime")
                    if isinstance((props or {}).get("start"), dict)
                    else (props or {}).get("eventStartDate")
                    or (props or {}).get("start")
                    or ""
                ),
                end_rfc=str(
                    ((props or {}).get("end") or {}).get("dateTime")
                    if isinstance((props or {}).get("end"), dict)
                    else (props or {}).get("eventEndDate")
                    or (props or {}).get("end")
                    or ""
                ),
                description=str((props or {}).get("description") or ""),
            )
        configured: dict[str, Any] = {
            auth_prop: {"authProvisionId": str(auth["auth_provision_id"])},
            **action_props,
        }
        result = await client.run_action(
            action_id=action_id,
            external_user_id=user_id,
            configured_props=configured,
        )
        if isinstance(result, dict) and result.get("error"):
            last_error = result
            continue
        return {
            "ok": True,
            "tool": tool_id,
            "via": "pipedream",
            "action_id": action_id,
            "result": result,
        }
    if last_error:
        return {
            "error": "PIPEDREAM_ACTION_FAILED",
            "provider": "pipedream",
            "tool": tool_id,
            "message": _pd_error_message(last_error) or None,
        }
    return None


def _connection_required(tool: str, *, message: str | None = None) -> dict[str, Any]:
    return {
        "error": "CONNECTION_REQUIRED",
        "provider": "pipedream",
        "tool": tool,
        "message": message
        or "Connect this Google app via Pipedream (each app can use a different account).",
    }


def _mime_raw(to: str, subject: str, body: str) -> str:
    message = MIMEText(body[:50000])
    message["to"] = to[:500]
    message["subject"] = subject[:500]
    return base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")


async def gmail_list(
    *, user_id: str, agent_id: str, query: str = "", max_results: int = 10, dry_run: bool = False
) -> dict[str, Any]:
    if dry_run:
        return {"dry_run": True, "tool": "gmail_list", "query": query}
    token = await _token(user_id, agent_id, "gmail_list")
    if not token:
        return {"error": "CONNECTION_REQUIRED", "provider": "google", "tool": "gmail_list"}
    params: dict[str, Any] = {"maxResults": min(max_results, 25)}
    if query:
        params["q"] = query[:500]
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 400:
        return {"error": "GMAIL_API_FAILED", "status": response.status_code}
    data = response.json()
    return {
        "messages": [
            {"id": m.get("id"), "threadId": m.get("threadId")}
            for m in (data.get("messages") or [])[:max_results]
        ],
        "resultSizeEstimate": data.get("resultSizeEstimate"),
    }


async def gmail_read(
    *, user_id: str, agent_id: str, message_id: str, dry_run: bool = False
) -> dict[str, Any]:
    if dry_run:
        return {"dry_run": True, "tool": "gmail_read", "message_id": message_id}
    token = await _token(user_id, agent_id, "gmail_read")
    if not token:
        return {"error": "CONNECTION_REQUIRED", "provider": "google", "tool": "gmail_read"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}",
            params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 400:
        return {"error": "GMAIL_API_FAILED", "status": response.status_code}
    data = response.json()
    headers = {
        h.get("name"): h.get("value")
        for h in (data.get("payload") or {}).get("headers") or []
        if h.get("name") in {"From", "Subject", "Date"}
    }
    return {
        "id": data.get("id"),
        "snippet": (data.get("snippet") or "")[:500],
        "headers": headers,
    }


async def gmail_send_draft(
    *,
    user_id: str,
    agent_id: str,
    to: str,
    subject: str,
    body: str,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Create a Gmail draft. Default dry_run=True.

    Note: the legacy tool id ``gmail_send`` also routes here for backward
    compatibility (prefer draft over immediate send). Use ``gmail_send_message``
    when an actual send is required.
    """
    if dry_run:
        return {
            "dry_run": True,
            "tool": "gmail_create_draft",
            "to": to[:200],
            "subject": subject[:200],
            "body_preview": body[:200],
        }
    token = await _token(user_id, agent_id, "gmail_create_draft")
    if not token:
        return {"error": "CONNECTION_REQUIRED", "provider": "google", "tool": "gmail_create_draft"}
    raw = _mime_raw(to, subject, body)
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": {"raw": raw}},
        )
    if response.status_code >= 400:
        return {"error": "GMAIL_API_FAILED", "status": response.status_code}
    data = response.json()
    return {
        "draft_id": data.get("id"),
        "message_id": (data.get("message") or {}).get("id"),
        "tool": "gmail_create_draft",
    }


async def gmail_send_message(
    *,
    user_id: str,
    agent_id: str,
    to: str,
    subject: str,
    body: str,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Actually send an email via Gmail users.messages.send (side-effect)."""
    if dry_run:
        return {
            "dry_run": True,
            "tool": "gmail_send_message",
            "to": to[:200],
            "subject": subject[:200],
            "body_preview": body[:200],
        }
    token = await _token(user_id, agent_id, "gmail_send_message")
    if not token:
        return {"error": "CONNECTION_REQUIRED", "provider": "google", "tool": "gmail_send_message"}
    raw = _mime_raw(to, subject, body)
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"raw": raw},
        )
    if response.status_code >= 400:
        return {"error": "GMAIL_API_FAILED", "status": response.status_code}
    data = response.json()
    return {
        "id": data.get("id"),
        "threadId": data.get("threadId"),
        "labelIds": data.get("labelIds"),
        "tool": "gmail_send_message",
        "sent": True,
    }


async def calendar_list(
    *,
    user_id: str,
    agent_id: str,
    max_results: int = 10,
    dry_run: bool = False,
) -> dict[str, Any]:
    if dry_run:
        return {"dry_run": True, "tool": "calendar_list"}
    token = await _token(user_id, agent_id, "calendar_list")
    if not token:
        pd = await _try_pipedream_action(
            user_id=user_id,
            agent_id=agent_id,
            tool_id="calendar_list",
            app_id="google_calendar",
            props={"calendarId": "primary", "maxResults": min(max_results, 25)},
        )
        if pd:
            return pd
        return _connection_required(
            "calendar_list",
            message="Connect Google Calendar via Pipedream to list events.",
        )
    # Google requires timeMin when orderBy=startTime + singleEvents=true.
    time_min = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            params={
                "maxResults": min(max_results, 25),
                "singleEvents": "true",
                "orderBy": "startTime",
                "timeMin": time_min,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 400:
        detail = ""
        try:
            detail = str(response.json().get("error", {}).get("message") or "")[:300]
        except Exception:  # noqa: BLE001
            detail = (response.text or "")[:300]
        if response.status_code in {401, 403}:
            return {
                "error": "CONNECTION_REQUIRED",
                "provider": "google",
                "tool": "calendar_list",
                "status": response.status_code,
                "message": detail
                or "Google Calendar denied access — reconnect your Google account with Calendar permissions.",
            }
        return {
            "error": "CALENDAR_API_FAILED",
            "status": response.status_code,
            "message": detail or None,
        }
    data = response.json()
    events = []
    for item in data.get("items") or []:
        events.append(
            {
                "id": item.get("id"),
                "summary": item.get("summary"),
                "start": item.get("start"),
                "end": item.get("end"),
            }
        )
    return {"events": events}


async def calendar_create_event(
    *,
    user_id: str,
    agent_id: str,
    title: str,
    start: str,
    end: str,
    description: str = "",
    dry_run: bool = True,
) -> dict[str, Any]:
    start_rfc = _as_rfc3339(start)
    end_rfc = _as_rfc3339(end, default_time="10:00:00")
    if dry_run:
        return {
            "dry_run": True,
            "tool": "calendar_create_event",
            "title": title[:200],
            "start": start_rfc,
            "end": end_rfc,
        }
    token = await _token(user_id, agent_id, "calendar_create_event")
    if not token:
        pd = await _try_pipedream_action(
            user_id=user_id,
            agent_id=agent_id,
            tool_id="calendar_create_event",
            app_id="google_calendar",
            props={
                "calendarId": "primary",
                "summary": title[:500],
                "description": description[:10000],
                "start": {"dateTime": start_rfc},
                "end": {"dateTime": end_rfc},
            },
        )
        if pd:
            return pd
        return _connection_required(
            "calendar_create_event",
            message="Connect Google Calendar via Pipedream to create events.",
        )
    body = {
        "summary": title[:500],
        "description": description[:10000],
        "start": {"dateTime": start_rfc},
        "end": {"dateTime": end_rfc},
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
    if response.status_code >= 400:
        detail = ""
        try:
            detail = str(response.json().get("error", {}).get("message") or "")[:300]
        except Exception:  # noqa: BLE001
            detail = (response.text or "")[:300]
        if response.status_code in {401, 403}:
            return {
                "error": "CONNECTION_REQUIRED",
                "provider": "google",
                "tool": "calendar_create_event",
                "status": response.status_code,
                "message": detail
                or "Google Calendar denied write access — reconnect with Calendar permissions.",
            }
        return {
            "error": "CALENDAR_API_FAILED",
            "status": response.status_code,
            "message": detail or None,
        }
    data = response.json()
    return {
        "id": data.get("id"),
        "htmlLink": data.get("htmlLink"),
        "summary": data.get("summary"),
        "tool": "calendar_create_event",
    }


async def google_docs_create(
    *,
    user_id: str,
    agent_id: str,
    title: str,
    body: str = "",
    dry_run: bool = True,
) -> dict[str, Any]:
    """Create a Google Doc and optionally seed initial content."""
    if dry_run:
        return {
            "dry_run": True,
            "tool": "google_docs_create",
            "title": title[:200],
            "body_chars": len(body or ""),
        }
    token = await _token(user_id, agent_id, "google_docs_create")
    if not token:
        return {"error": "CONNECTION_REQUIRED", "provider": "google", "tool": "google_docs_create"}
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        created = await client.post(
            "https://docs.googleapis.com/v1/documents",
            headers=headers,
            json={"title": title[:200]},
        )
        if created.status_code >= 400:
            return {
                "error": "GOOGLE_DOCS_API_FAILED",
                "status": created.status_code,
                "detail": created.text[:300],
            }
        doc = created.json()
        doc_id = str(doc.get("documentId") or "")
        if body and doc_id:
            await client.post(
                f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate",
                headers=headers,
                json={
                    "requests": [
                        {
                            "insertText": {
                                "location": {"index": 1},
                                "text": body[:50000],
                            }
                        }
                    ]
                },
            )
    return {
        "document_id": doc_id,
        "title": doc.get("title") or title[:200],
        "url": f"https://docs.google.com/document/d/{doc_id}/edit" if doc_id else None,
        "tool": "google_docs_create",
    }


async def google_docs_append(
    *,
    user_id: str,
    agent_id: str,
    document_id: str,
    text: str,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Append text at the end of an existing Google Doc."""
    if dry_run:
        return {
            "dry_run": True,
            "tool": "google_docs_append",
            "document_id": document_id[:128],
            "text_chars": len(text or ""),
        }
    token = await _token(user_id, agent_id, "google_docs_append")
    if not token:
        return {"error": "CONNECTION_REQUIRED", "provider": "google", "tool": "google_docs_append"}
    doc_id = document_id.strip()[:128]
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        meta = await client.get(
            f"https://docs.googleapis.com/v1/documents/{doc_id}",
            headers=headers,
            params={"fields": "documentId,title,body(content(endIndex))"},
        )
        if meta.status_code >= 400:
            return {
                "error": "GOOGLE_DOCS_API_FAILED",
                "status": meta.status_code,
                "detail": meta.text[:300],
            }
        payload = meta.json()
        end_index = 1
        for block in (payload.get("body") or {}).get("content") or []:
            if isinstance(block.get("endIndex"), int):
                end_index = max(end_index, int(block["endIndex"]))
        # Insert before the final newline that Docs always keeps.
        insert_at = max(1, end_index - 1)
        chunk = text if text.endswith("\n") else f"{text}\n"
        updated = await client.post(
            f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate",
            headers=headers,
            json={
                "requests": [
                    {
                        "insertText": {
                            "location": {"index": insert_at},
                            "text": chunk[:50000],
                        }
                    }
                ]
            },
        )
        if updated.status_code >= 400:
            return {
                "error": "GOOGLE_DOCS_API_FAILED",
                "status": updated.status_code,
                "detail": updated.text[:300],
            }
    return {
        "document_id": doc_id,
        "title": payload.get("title"),
        "url": f"https://docs.google.com/document/d/{doc_id}/edit",
        "tool": "google_docs_append",
    }
