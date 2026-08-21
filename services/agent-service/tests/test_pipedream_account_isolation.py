"""Pipedream account sync must never cross-wire product apps."""

from __future__ import annotations

from agent_service.integrations.pipedream.accounts import _apps_equivalent, _normalize_app_slug


def test_app_slug_normalization():
    assert _normalize_app_slug("google-calendar") == "google_calendar"
    assert _apps_equivalent("google-calendar", "google_calendar")
    assert _apps_equivalent("x_ai", "xai")
    assert _apps_equivalent("mistral_ai", "mistral")
    assert not _apps_equivalent("notion", "google_calendar")
    assert not _apps_equivalent("canva", "notion")


def test_distinct_apps_are_not_equivalent():
    """Regression: Notion must never be treated as Google Calendar."""
    pairs = [
        ("notion", "google_calendar"),
        ("canva", "google_calendar"),
        ("canva", "notion"),
        ("gmail", "google_calendar"),
    ]
    for a, b in pairs:
        assert not _apps_equivalent(a, b), f"{a} incorrectly matches {b}"
