"""M-G: persisted approval helpers + side-effect gating."""

from __future__ import annotations

from agent_service.runtime import approvals as approvals_mod
from agent_service.runtime.approvals import requires_approval, summarize_action
from agent_service.tools.runtime import SIDE_EFFECT_TOOLS


def test_requires_approval_matches_side_effect_registry():
    assert requires_approval("gmail_send") is True
    assert requires_approval("gmail_list") is False
    assert "gmail_send" in SIDE_EFFECT_TOOLS


def test_summarize_gmail_send():
    summary = summarize_action("gmail_send", {"to": "a@b.com", "subject": "Hello"})
    assert "a@b.com" in summary
    assert "Hello" in summary


def test_summarize_generic_tool():
    assert summarize_action("calendar_list", {}) == "Execute calendar_list"


class _FakeResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.posts = []
        self.patches = []
        self.gets = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, path, json=None, headers=None):
        self.posts.append((path, json))
        return self._responses.pop(0)

    async def patch(self, path, params=None, json=None, headers=None):
        self.patches.append((path, params, json))
        return self._responses.pop(0)

    async def get(self, path, params=None):
        self.gets.append((path, params))
        return self._responses.pop(0)


async def test_create_approval_request(monkeypatch):
    client = _FakeClient([_FakeResp(201, [{"id": "appr-1", "status": "pending", "tool_id": "gmail_send"}])])
    monkeypatch.setattr(approvals_mod, "get_supabase_admin_client", lambda: client)
    row = await approvals_mod.create_approval_request(
        user_id="u1",
        agent_id="a1",
        run_id="r1",
        thread_id="t1",
        tool_id="gmail_send",
        action_summary="Send email",
        payload={"arguments": {"to": "x@y.com"}},
    )
    assert row["id"] == "appr-1"
    assert client.posts[0][1]["status"] == "pending"
    assert client.posts[0][1]["tool_id"] == "gmail_send"


async def test_decide_approval(monkeypatch):
    client = _FakeClient(
        [
            _FakeResp(200, [{"id": "appr-1", "status": "pending", "user_id": "u1"}]),
            _FakeResp(200, [{"id": "appr-1", "status": "approved"}]),
        ]
    )
    monkeypatch.setattr(approvals_mod, "get_supabase_admin_client", lambda: client)
    row = await approvals_mod.decide_approval(
        user_id="u1", approval_id="appr-1", decision="approved"
    )
    assert row["status"] == "approved"
    assert client.patches[0][2]["status"] == "approved"


async def test_approved_tool_ids_for_run(monkeypatch):
    client = _FakeClient(
        [_FakeResp(200, [{"tool_id": "gmail_send"}, {"tool_id": "gmail_send"}])]
    )
    monkeypatch.setattr(approvals_mod, "get_supabase_admin_client", lambda: client)
    ids = await approvals_mod.approved_tool_ids_for_run(user_id="u1", run_id="r1")
    assert ids == ["gmail_send"]
