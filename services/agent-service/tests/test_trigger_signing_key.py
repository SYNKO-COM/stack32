"""Without the signing key, a trigger fires perfectly and reaches nobody.

Pipedream returns `webhook_signing_key` on its deploy response. We looked only
for `signing_key`, so nothing was stored, every delivery failed its signature
check, and the webhook endpoint answered 401. Discord fired, Pipedream
delivered, and the agent never woke: the whole point of a tool trigger.
"""

from __future__ import annotations

from agent_service.triggers.service import _signing_keys_for


def extract(deployed: dict) -> str:
    """Mirrors the extraction _deploy_source performs on the deploy response."""
    from agent_service.triggers.service import _unwrap_pd

    inner = _unwrap_pd(deployed)
    webhook_meta = inner.get("webhook") if isinstance(inner.get("webhook"), dict) else {}
    return str(
        inner.get("webhook_signing_key")
        or deployed.get("webhook_signing_key")
        or webhook_meta.get("webhook_signing_key")
        or inner.get("signing_key")
        or deployed.get("signing_key")
        or webhook_meta.get("signing_key")
        or ""
    )


def test_the_key_pipedream_actually_returns_is_read():
    # Shape observed live from /connect/{project}/triggers/deploy.
    deployed = {"data": {"id": "dc_abc", "webhook_signing_key": "1605dd7c"}}
    assert extract(deployed) == "1605dd7c"


def test_the_older_name_still_works():
    assert extract({"data": {"id": "dc_abc", "signing_key": "legacy"}}) == "legacy"


def test_a_key_nested_under_webhook_is_found():
    assert extract({"data": {"id": "dc_abc", "webhook": {"signing_key": "nested"}}}) == "nested"


def test_no_key_at_all_is_not_a_crash():
    assert extract({"data": {"id": "dc_abc"}}) == ""


def test_a_stored_key_is_offered_for_verification():
    assert _signing_keys_for({"webhook_signing_key": "abc"})[0] == "abc"


def test_a_row_without_a_key_falls_back_to_the_environment(monkeypatch):
    from agent_service.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("PIPEDREAM_WEBHOOK_SIGNING_KEY", "env-key")
    try:
        assert "env-key" in _signing_keys_for({})
    finally:
        get_settings.cache_clear()
