"""Google Gmail + Calendar tools — credentials from ConnectionManager only."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from agent_service.connections.manager import ConnectionManager

logger = logging.getLogger(__name__)


async def _token(user_id: str, agent_id: str) -> str | None:
    return await ConnectionManager().resolve_access_token(
        user_id=user_id, agent_id=agent_id, provider="google"
    )


async def gmail_list(
    *, user_id: str, agent_id: str, query: str = "", max_results: int = 10, dry_run: bool = False
) -> dict[str, Any]:
    if dry_run:
        return {"dry_run": True, "tool": "gmail_list", "query": query}
    token = await _token(user_id, agent_id)
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
    token = await _token(user_id, agent_id)
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
    """Default dry_run=True — real send requires explicit approval + dry_run=False."""
    if dry_run:
        return {
            "dry_run": True,
            "tool": "gmail_send",
            "to": to[:200],
            "subject": subject[:200],
            "body_preview": body[:200],
        }
    token = await _token(user_id, agent_id)
    if not token:
        return {"error": "CONNECTION_REQUIRED", "provider": "google", "tool": "gmail_send"}
    # Create draft only (safer than immediate send) unless approved send path is used later.
    import base64
    from email.mime.text import MIMEText

    message = MIMEText(body[:50000])
    message["to"] = to[:500]
    message["subject"] = subject[:500]
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": {"raw": raw}},
        )
    if response.status_code >= 400:
        return {"error": "GMAIL_API_FAILED", "status": response.status_code}
    data = response.json()
    return {"draft_id": data.get("id"), "message_id": (data.get("message") or {}).get("id")}


async def calendar_list(
    *,
    user_id: str,
    agent_id: str,
    max_results: int = 10,
    dry_run: bool = False,
) -> dict[str, Any]:
    if dry_run:
        return {"dry_run": True, "tool": "calendar_list"}
    token = await _token(user_id, agent_id)
    if not token:
        return {"error": "CONNECTION_REQUIRED", "provider": "google", "tool": "calendar_list"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            params={
                "maxResults": min(max_results, 25),
                "singleEvents": "true",
                "orderBy": "startTime",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 400:
        return {"error": "CALENDAR_API_FAILED", "status": response.status_code}
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
