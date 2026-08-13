"""M5 — self-contained cron recurrence tests."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from agent_service.scheduling.cron import (
    CronError,
    compute_next_run,
    make_occurrence_key,
    parse_cron,
)


def test_parse_cron_fields():
    minute, hour, dom, month, dow = parse_cron("0 9 * * 1-5")
    assert minute == {0}
    assert hour == {9}
    assert dow == {1, 2, 3, 4, 5}


def test_parse_cron_rejects_bad():
    with pytest.raises(CronError):
        parse_cron("* * *")


def test_hourly_next_run():
    after = datetime(2026, 1, 1, 10, 30, tzinfo=UTC)
    nxt = compute_next_run("0 * * * *", "UTC", after)
    assert nxt == datetime(2026, 1, 1, 11, 0, tzinfo=UTC)


def test_daily_9am_paris_is_utc_offset():
    # 09:00 Europe/Paris in January (UTC+1) -> 08:00 UTC.
    after = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    nxt = compute_next_run("0 9 * * *", "Europe/Paris", after)
    assert nxt == datetime(2026, 1, 1, 8, 0, tzinfo=UTC)


def test_weekday_only():
    # 2026-01-03 is a Saturday; next weekday 09:00 UTC run is Monday 2026-01-05.
    after = datetime(2026, 1, 3, 12, 0, tzinfo=UTC)
    nxt = compute_next_run("0 9 * * 1-5", "UTC", after)
    assert nxt == datetime(2026, 1, 5, 9, 0, tzinfo=UTC)


def test_sunday_seven_alias():
    # Sunday expressed as 7 should match 2026-01-04 (a Sunday).
    after = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    nxt = compute_next_run("0 0 * * 7", "UTC", after)
    assert nxt == datetime(2026, 1, 4, 0, 0, tzinfo=UTC)


def test_invalid_timezone_falls_back_to_utc():
    after = datetime(2026, 1, 1, 10, 30, tzinfo=UTC)
    nxt = compute_next_run("0 * * * *", "Not/AZone", after)
    assert nxt == datetime(2026, 1, 1, 11, 0, tzinfo=UTC)


def test_naive_after_treated_as_utc():
    nxt = compute_next_run("0 * * * *", "UTC", datetime(2026, 1, 1, 10, 30))
    assert nxt == datetime(2026, 1, 1, 11, 0, tzinfo=UTC)


def test_occurrence_key_is_deterministic():
    dt = datetime(2026, 1, 1, 11, 0, 30, tzinfo=UTC)
    key = make_occurrence_key("sched-1", dt)
    assert key == "sched-1:2026-01-01T11:00:00+00:00"
