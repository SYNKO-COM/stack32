"""Google Gmail + Calendar tools — credentials from ConnectionManager only."""

from __future__ import annotations

import base64
import logging
from email.mime.text import MIMEText
from typing import Any

import httpx

from agent_service.connections.manager import ConnectionManager

logger = logging.getLogger(__name__)


async def _token(user_id: str, agent_id: str, tool_id: str | None = None) -> str | None:
    return await ConnectionManager().resolve_access_token(
        user_id=user_id, agent_id=agent_id, provider="google", tool_id=tool_id
    )


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
    if dry_run:
        return {
            "dry_run": True,
            "tool": "calendar_create_event",
            "title": title[:200],
            "start": start,
            "end": end,
        }
    token = await _token(user_id, agent_id, "calendar_create_event")
    if not token:
        return {
            "error": "CONNECTION_REQUIRED",
            "provider": "google",
            "tool": "calendar_create_event",
        }
    body = {
        "summary": title[:500],
        "description": description[:10000],
        "start": {"dateTime": start},
        "end": {"dateTime": end},
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
    if response.status_code >= 400:
        return {"error": "CALENDAR_API_FAILED", "status": response.status_code}
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
