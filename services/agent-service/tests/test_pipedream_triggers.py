"""Pipedream tool-trigger webhooks: signature, listen window, idempotence, enqueue."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from agent_service.triggers.service import event_to_prompt, ingest_pipedream_event
from agent_service.triggers.signature import WebhookSignatureError, verify_webhook_signature


def _sign(key: str, body: bytes, ts: int | None = None) -> str:
    timestamp = str(ts if ts is not None else int(time.time()))
    digest = hmac.new(
        key.encode("utf-8"),
        f"{timestamp}.".encode("utf-8") + body,
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def test_verify_webhook_signature_accepts_valid():
    body = b'{"id":"evt_1"}'
    header = _sign("secret", body)
    verify_webhook_signature(signing_key="secret", signature_header=header, raw_body=body)


def test_verify_webhook_signature_rejects_bad_hmac():
    body = b'{"id":"evt_1"}'
    header = _sign("secret", body)
    with pytest.raises(WebhookSignatureError) as exc:
        verify_webhook_signature(signing_key="other", signature_header=header, raw_body=body)
    assert exc.value.code == "INVALID_SIGNATURE"


def test_verify_webhook_signature_rejects_replay():
    body = b'{"id":"evt_1"}'
    header = _sign("secret", body, ts=int(time.time()) - 400)
    with pytest.raises(WebhookSignatureError) as exc:
        verify_webhook_signature(signing_key="secret", signature_header=header, raw_body=body)
    assert exc.value.code == "SIGNATURE_EXPIRED"


def test_event_to_prompt_unwraps_nested_event():
    prompt = event_to_prompt(
        app_id="gmail",
        component_id="gmail-new-email",
        payload={"id": "x", "event": {"subject": "Hello", "from": "a@b.com"}},
    )
    assert "gmail-new-email" in prompt
    assert "Hello" in prompt
    assert "a@b.com" in prompt


class _Resp:
    def __init__(self, status_code: int, payload: Any = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text

    def json(self) -> Any:
        return self._payload


class FakeClient:
    def __init__(self, row: dict[str, Any], *, duplicate: bool = False):
        self.row = row
        self.duplicate = duplicate
        self.posts: list[tuple[str, dict]] = []
        self.patches: list[tuple[str, dict]] = []

    async def get(self, path: str, params: dict | None = None):
        if path == "/agent_triggers":
            return _Resp(200, [self.row])
        return _Resp(200, [])

    async def post(self, path: str, json: dict | None = None, headers: dict | None = None):
        self.posts.append((path, json or {}))
        if path == "/agent_trigger_events":
            if self.duplicate:
                return _Resp(409, {}, text="duplicate")
            return _Resp(201, [{"id": "evt-row-1"}])
        return _Resp(201, {})

    async def patch(self, path: str, params: dict | None = None, json: dict | None = None):
        self.patches.append((path, json or {}))
        if path == "/agent_triggers" and json:
            self.row.update(json)
        return _Resp(200, [])


class FakeDb:
    def __init__(self) -> None:
        self.runs: list[dict[str, Any]] = []

    async def create_run(self, **kwargs):
        self.runs.append(kwargs)


@pytest.mark.asyncio
async def test_ingest_enqueues_run_and_stops_listen(monkeypatch):
    body = json.dumps({"id": "pd_evt_1", "event": {"subject": "Hi"}}).encode()
    until = (datetime.now(UTC) + timedelta(minutes=4)).isoformat()
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "user_id": "user-1",
        "agent_id": "agent-1",
        "status": "listening",
        "mode": "listen",
        "listening_until": until,
        "app_id": "gmail",
        "component_id": "gmail-new-email",
        "deployed_source_id": "dc_test",
        "webhook_signing_key": "secret",
    }
    client = FakeClient(row)
    db = FakeDb()
    header = _sign("secret", body)

    async def _install(**kwargs):
        return {"id": "inst-1"}

    async def _enqueue(**kwargs):
        return None

    async def _delete_source(**kwargs):
        return None

    monkeypatch.setattr(
        "agent_service.installations.service.get_or_create_installation",
        _install,
    )
    monkeypatch.setattr("agent_service.queue.dispatch.enqueue_run", _enqueue)
    monkeypatch.setattr("agent_service.triggers.service._delete_source", _delete_source)

    result = await ingest_pipedream_event(
        trigger_id=row["id"],
        raw_body=body,
        signature_header=header,
        payload=json.loads(body),
        db=db,
        client=client,
    )
    assert result["accepted"] is True
    assert result["duplicate"] is False
    assert db.runs and db.runs[0]["kind"] == "live"
    assert db.runs[0]["input_payload"]["trigger_kind"] == "tool"
    assert "Hi" in db.runs[0]["input_payload"]["prompt"]
    status_patch = next(p for p in client.patches if p[0] == "/agent_triggers")
    assert status_patch[1]["status"] == "idle"


@pytest.mark.asyncio
async def test_ingest_duplicate_does_not_reenqueue(monkeypatch):
    body = b'{"id":"pd_evt_dup"}'
    until = (datetime.now(UTC) + timedelta(minutes=4)).isoformat()
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "user_id": "user-1",
        "agent_id": "agent-1",
        "status": "listening",
        "mode": "listen",
        "listening_until": until,
        "app_id": "gmail",
        "component_id": "gmail-new-email",
        "webhook_signing_key": "secret",
    }
    client = FakeClient(row, duplicate=True)
    db = FakeDb()
    monkeypatch.setattr("agent_service.triggers.service._delete_source", lambda **k: None)
    result = await ingest_pipedream_event(
        trigger_id=row["id"],
        raw_body=body,
        signature_header=_sign("secret", body),
        payload={"id": "pd_evt_dup"},
        db=db,
        client=client,
    )
    assert result["duplicate"] is True
    assert db.runs == []


@pytest.mark.asyncio
async def test_ingest_rejects_invalid_signature():
    body = b'{"id":"x"}'
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "status": "listening",
        "mode": "listen",
        "listening_until": (datetime.now(UTC) + timedelta(minutes=4)).isoformat(),
        "webhook_signing_key": "secret",
    }
    result = await ingest_pipedream_event(
        trigger_id=row["id"],
        raw_body=body,
        signature_header=_sign("wrong", body),
        payload={"id": "x"},
        db=FakeDb(),
        client=FakeClient(row),
    )
    assert result["accepted"] is False
    assert result["code"] == "INVALID_SIGNATURE"
