"""SMTP mailer for terminal scheduled-run notifications (M5).

Uses the Python stdlib (``smtplib`` + ``ssl``) executed in a worker thread, so no
new dependency is required. The From header (no_reply@stack32.com / Stack32) is
deliberately different from the SMTP auth user (hello@stack32.com).

Email delivery is best-effort: a failure here is recorded but must NEVER fail the
scheduled run itself.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr

from agent_service.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailResult:
    sent: bool
    status: str  # sent | skipped | failed
    detail: str | None = None


class EmailService:
    """Minimal SMTP sender. Safe to construct anywhere; reads settings lazily."""

    def __init__(self) -> None:
        self.settings = get_settings()

    def _configured(self) -> bool:
        s = self.settings
        return bool(s.EMAIL_ENABLED and s.SMTP_HOST and s.SMTP_USERNAME and s.SMTP_PASSWORD)

    def _build_message(self, *, to_email: str, subject: str, body: str) -> EmailMessage:
        s = self.settings
        msg = EmailMessage()
        msg["From"] = formataddr((s.EMAIL_FROM_NAME, s.EMAIL_FROM_ADDRESS))
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body)
        return msg

    def _send_sync(self, msg: EmailMessage) -> None:
        s = self.settings
        context = ssl.create_default_context()
        if s.SMTP_USE_TLS:
            with smtplib.SMTP_SSL(s.SMTP_HOST, s.SMTP_PORT, context=context, timeout=20) as server:
                server.login(s.SMTP_USERNAME, s.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=20) as server:
                server.ehlo()
                server.starttls(context=context)
                server.login(s.SMTP_USERNAME, s.SMTP_PASSWORD)
                server.send_message(msg)

    async def send(self, *, to_email: str, subject: str, body: str) -> EmailResult:
        if not to_email or "@" not in to_email:
            return EmailResult(False, "failed", "invalid recipient")
        if not self._configured():
            # Dev/test path: never send, just log so runs still succeed offline.
            logger.info("email skipped (not configured) to=%s subject=%s", to_email, subject)
            return EmailResult(False, "skipped", "email not configured")
        msg = self._build_message(to_email=to_email, subject=subject, body=body)
        try:
            await asyncio.to_thread(self._send_sync, msg)
        except Exception as exc:  # noqa: BLE001
            logger.warning("email send failed to=%s err=%s", to_email, type(exc).__name__)
            return EmailResult(False, "failed", f"{type(exc).__name__}: {str(exc)[:200]}")
        return EmailResult(True, "sent")

    async def send_scheduled_run_notification(
        self,
        *,
        to_email: str,
        agent_name: str,
        run_id: str,
        status: str,
        summary: str | None = None,
    ) -> EmailResult:
        subject = f"[Stack32] {agent_name} — scheduled run {status}"
        lines = [
            f"Your scheduled agent \"{agent_name}\" finished a run.",
            "",
            f"Status: {status}",
            f"Run ID: {run_id}",
        ]
        if summary:
            lines += ["", summary.strip()[:2000]]
        lines += ["", "— Stack32"]
        return await self.send(to_email=to_email, subject=subject, body="\n".join(lines))


_service: EmailService | None = None


def get_email_service() -> EmailService:
    global _service
    if _service is None:
        _service = EmailService()
    return _service
