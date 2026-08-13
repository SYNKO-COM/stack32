"""Self-contained 5-field cron recurrence with IANA timezone support (M5).

No external dependency: a minute-stepping matcher that honours the Vixie-cron
day-of-month / day-of-week OR semantics. Pure and unit-testable.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_FIELD_BOUNDS = [
    (0, 59),  # minute
    (0, 23),  # hour
    (1, 31),  # day of month
    (1, 12),  # month
    (0, 6),   # day of week (0 = Sunday)
]


class CronError(ValueError):
    """Raised for an unparseable cron expression."""


def _parse_field(spec: str, low: int, high: int, *, dow: bool = False) -> set[int]:
    values: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            raise CronError(f"empty cron field part in {spec!r}")
        step = 1
        if "/" in part:
            base, step_s = part.split("/", 1)
            try:
                step = int(step_s)
            except ValueError as exc:
                raise CronError(f"bad step in {part!r}") from exc
            if step <= 0:
                raise CronError(f"non-positive step in {part!r}")
        else:
            base = part
        if base == "*":
            start, end = low, high
        elif "-" in base:
            a, b = base.split("-", 1)
            try:
                start, end = int(a), int(b)
            except ValueError as exc:
                raise CronError(f"bad range in {base!r}") from exc
        else:
            try:
                start = end = int(base)
            except ValueError as exc:
                raise CronError(f"bad value in {base!r}") from exc
        if dow:
            # Accept 7 as Sunday; normalize to 0.
            start = 0 if start == 7 else start
            end = 0 if end == 7 else end
        for v in range(start, end + 1, step):
            vv = 0 if (dow and v == 7) else v
            if not (low <= vv <= high):
                raise CronError(f"value {vv} out of bounds for field")
            values.add(vv)
    return values


def parse_cron(expr: str) -> tuple[set[int], set[int], set[int], set[int], set[int]]:
    fields = (expr or "").split()
    if len(fields) != 5:
        raise CronError("cron must have exactly 5 fields")
    minute = _parse_field(fields[0], *_FIELD_BOUNDS[0])
    hour = _parse_field(fields[1], *_FIELD_BOUNDS[1])
    dom = _parse_field(fields[2], *_FIELD_BOUNDS[2])
    month = _parse_field(fields[3], *_FIELD_BOUNDS[3])
    dow = _parse_field(fields[4], *_FIELD_BOUNDS[4], dow=True)
    return minute, hour, dom, month, dow


def _dom_dow_restricted(field_spec: str) -> bool:
    return field_spec.strip() != "*"


def compute_next_run(
    cron_expr: str,
    timezone: str = "UTC",
    after: datetime | None = None,
    *,
    max_days: int = 400,
) -> datetime:
    """Return the next UTC datetime strictly after ``after`` matching the cron.

    ``after`` is treated as UTC if naive. Timezone is an IANA name; invalid names
    fall back to UTC. Raises ``CronError`` if no match within ``max_days``.
    """
    minute, hour, dom, month, dow = parse_cron(cron_expr)
    fields = (cron_expr or "").split()
    dom_restricted = _dom_dow_restricted(fields[2])
    dow_restricted = _dom_dow_restricted(fields[4])

    try:
        tz = ZoneInfo(timezone or "UTC")
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        tz = ZoneInfo("UTC")

    base = after or datetime.now(UTC)
    if base.tzinfo is None:
        base = base.replace(tzinfo=UTC)
    # Work in the schedule's local timezone, stepping minute by minute.
    local = base.astimezone(tz).replace(second=0, microsecond=0) + timedelta(minutes=1)
    limit = local + timedelta(days=max_days)
    while local <= limit:
        # cron day-of-week: Python weekday() Mon=0..Sun=6 -> convert to Sun=0..Sat=6.
        cron_dow = (local.weekday() + 1) % 7
        dom_ok = local.day in dom
        dow_ok = cron_dow in dow
        if dom_restricted and dow_restricted:
            day_ok = dom_ok or dow_ok
        elif dom_restricted:
            day_ok = dom_ok
        elif dow_restricted:
            day_ok = dow_ok
        else:
            day_ok = True
        if (
            local.minute in minute
            and local.hour in hour
            and local.month in month
            and day_ok
        ):
            return local.astimezone(UTC)
        local += timedelta(minutes=1)
    raise CronError(f"no cron match within {max_days} days for {cron_expr!r}")


def make_occurrence_key(schedule_id: str, occurrence_utc: datetime) -> str:
    """Deterministic idempotency key for a specific schedule occurrence."""
    iso = occurrence_utc.astimezone(UTC).replace(second=0, microsecond=0).isoformat()
    return f"{schedule_id}:{iso}"
