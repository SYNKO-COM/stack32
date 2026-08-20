"""Authoritative current date/time context for every agent turn."""

from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def current_datetime_snapshot(timezone: str | None = None) -> dict[str, str]:
    """Return a structured snapshot of 'now' (UTC + optional IANA timezone)."""
    now_utc = datetime.now(UTC)
    payload: dict[str, str] = {
        "iso_utc": now_utc.isoformat(),
        "date_utc": now_utc.strftime("%Y-%m-%d"),
        "time_utc": now_utc.strftime("%H:%M:%S"),
        "weekday_utc": now_utc.strftime("%A"),
        "timezone": "UTC",
    }
    tz_name = (timezone or "").strip() or "UTC"
    if tz_name != "UTC":
        try:
            local = now_utc.astimezone(ZoneInfo(tz_name))
            payload.update(
                {
                    "timezone": tz_name,
                    "iso_local": local.isoformat(),
                    "date_local": local.strftime("%Y-%m-%d"),
                    "time_local": local.strftime("%H:%M:%S"),
                    "weekday_local": local.strftime("%A"),
                }
            )
        except (ZoneInfoNotFoundError, ValueError, KeyError):
            pass
    return payload


def current_datetime_system_block(timezone: str | None = None) -> str:
    """System-prompt block so the model always knows today's date and time."""
    snap = current_datetime_snapshot(timezone)
    lines = [
        "CURRENT_DATETIME (authoritative, refreshed every turn — trust this over memory):",
        f"- UTC: {snap['weekday_utc']} {snap['date_utc']} {snap['time_utc']} ({snap['iso_utc']})",
    ]
    if snap.get("iso_local"):
        lines.append(
            f"- Local ({snap['timezone']}): {snap['weekday_local']} "
            f"{snap['date_local']} {snap['time_local']} ({snap['iso_local']})"
        )
    lines.append(
        "Use this clock for scheduling language, deadlines, and 'today/now' reasoning."
    )
    return "\n".join(lines)
