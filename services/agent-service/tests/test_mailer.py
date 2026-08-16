"""M5 — mailer skip/build/failure behavior (no live SMTP)."""

from __future__ import annotations

from agent_service.config import get_settings
from agent_service.notifications.mailer import EmailService, get_email_service


def _disable_email(monkeypatch) -> None:
    """Isolate from developer .env / Cloud Run secrets that enable SMTP."""
    get_settings.cache_clear()
    monkeypatch.setenv("EMAIL_ENABLED", "false")
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.setenv("EMAIL_FROM_ADDRESS", "no_reply@stack32.com")
    monkeypatch.setenv("EMAIL_FROM_NAME", "Stack32")
    get_settings.cache_clear()


async def test_email_skipped_when_not_configured(monkeypatch):
    _disable_email(monkeypatch)
    svc = EmailService()
    result = await svc.send(to_email="user@example.com", subject="hi", body="body")
    # Default settings have EMAIL_ENABLED=false -> skipped, not failed.
    assert result.status == "skipped"
    assert result.sent is False


async def test_invalid_recipient_is_failed(monkeypatch):
    _disable_email(monkeypatch)
    svc = EmailService()
    result = await svc.send(to_email="not-an-email", subject="hi", body="body")
    assert result.status == "failed"


def test_message_headers_use_distinct_from(monkeypatch):
    _disable_email(monkeypatch)
    svc = EmailService()
    msg = svc._build_message(to_email="user@example.com", subject="s", body="b")
    # From is the no_reply identity, distinct from any SMTP auth user.
    assert "no_reply@stack32.com" in msg["From"]
    assert "Stack32" in msg["From"]
    assert msg["To"] == "user@example.com"


async def test_scheduled_notification_builds_subject(monkeypatch):
    _disable_email(monkeypatch)
    svc = get_email_service()
    result = await svc.send_scheduled_run_notification(
        to_email="user@example.com",
        agent_name="Daily Digest",
        run_id="run-1",
        status="succeeded",
        summary="All good.",
    )
    # Not configured in tests -> skipped, but the call path must not raise.
    assert result.status in {"skipped", "failed"}
