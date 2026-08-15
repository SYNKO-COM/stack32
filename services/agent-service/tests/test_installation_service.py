"""Installation service unit tests (mocked persistence)."""

from __future__ import annotations

import pytest

from agent_service.installations.service import InstallationError, InstallationService


class _FakeDB:
    def __init__(self) -> None:
        self.agents = {
            "def-1": {
                "id": "def-1",
                "user_id": "owner",
                "status": "built",
                "draft_version_id": "v1",
                "published_version_id": None,
                "deleted_at": None,
            }
        }
        self.installs: dict[tuple[str, str], dict] = {}
        self.audits: list[dict] = []

    async def _select(self, table: str, params: dict[str, str]):
        if table == "agent_installations":
            user = (params.get("user_id") or "").replace("eq.", "")
            agent = (params.get("agent_id") or "").replace("eq.", "")
            iid = (params.get("id") or "").replace("eq.", "")
            if iid:
                for row in self.installs.values():
                    if row["id"] == iid and row["user_id"] == user:
                        return [row]
                return []
            key = (user, agent)
            return [self.installs[key]] if key in self.installs else []
        if table == "agents":
            aid = (params.get("id") or "").replace("eq.", "")
            status = (params.get("status") or "").replace("eq.", "")
            row = self.agents.get(aid)
            if not row:
                return []
            if status and row.get("status") != status:
                return []
            return [row]
        return []

    async def get_owned_agent(self, agent_id: str, user_id: str):
        row = self.agents.get(agent_id)
        if row and row.get("user_id") == user_id:
            return row
        return None

    async def audit(self, **kwargs):
        self.audits.append(kwargs)


@pytest.mark.asyncio
async def test_get_or_create_idempotent(monkeypatch):
    db = _FakeDB()
    svc = InstallationService(db)  # type: ignore[arg-type]

    created_payloads: list[dict] = []

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, path, json=None, headers=None):
            created_payloads.append(json or {})
            key = (json["user_id"], json["agent_id"])
            db.installs[key] = json

            class R:
                status_code = 201

                def json(self_inner):
                    return [json]

            return R()

    monkeypatch.setattr(
        "agent_service.installations.service.get_supabase_admin_client",
        lambda: _Client(),
    )

    a = await svc.get_or_create(user_id="owner", agent_id="def-1")
    b = await svc.get_or_create(user_id="owner", agent_id="def-1")
    assert a["id"] == b["id"]
    assert len(created_payloads) == 1


@pytest.mark.asyncio
async def test_consumer_cannot_steal_owner_install(monkeypatch):
    db = _FakeDB()
    db.agents["def-1"]["status"] = "published"
    db.installs[("owner", "def-1")] = {
        "id": "inst-owner",
        "user_id": "owner",
        "agent_id": "def-1",
        "status": "ready",
    }
    svc = InstallationService(db)  # type: ignore[arg-type]

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, path, json=None, headers=None):
            key = (json["user_id"], json["agent_id"])
            db.installs[key] = json

            class R:
                status_code = 201

                def json(self_inner):
                    return [json]

            return R()

    monkeypatch.setattr(
        "agent_service.installations.service.get_supabase_admin_client",
        lambda: _Client(),
    )

    consumer = await svc.get_or_create(user_id="consumer", agent_id="def-1")
    assert consumer["user_id"] == "consumer"
    assert consumer["id"] != "inst-owner"


@pytest.mark.asyncio
async def test_assert_owns_installation_rejects_foreign():
    db = _FakeDB()
    db.installs[("owner", "def-1")] = {
        "id": "inst-owner",
        "user_id": "owner",
        "agent_id": "def-1",
        "status": "ready",
    }
    svc = InstallationService(db)  # type: ignore[arg-type]
    with pytest.raises(InstallationError) as exc:
        await svc.assert_owns_installation(installation_id="inst-owner", user_id="hacker")
    assert exc.value.code == "INSTALLATION_FORBIDDEN"
