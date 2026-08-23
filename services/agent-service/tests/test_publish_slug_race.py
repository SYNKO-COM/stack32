"""The database, not a prior SELECT, decides whether a public slug is free.

_ensure_unique_public_slug did check-then-write: it queried for a free slug,
picked one, then patched. Two publishes of the same agent name racing each
other both observe the slug as free, and the loser hit the
agents_user_slug_active_key unique index — surfacing as a 500 on publish rather
than quietly taking the next suffix. A Python-side check cannot serialise fifty
Cloud Run instances.
"""

from __future__ import annotations

from agent_service.publishing.service import _is_unique_violation


class _Response:
    def __init__(self, status_code: int, payload=None, raises: bool = False):
        self.status_code = status_code
        self._payload = payload
        self._raises = raises

    def json(self):
        if self._raises:
            raise ValueError("not json")
        return self._payload


def test_postgrest_unique_violation_is_recognised():
    assert _is_unique_violation(_Response(409, {"code": "23505"})) is True


def test_duplicate_key_message_is_recognised():
    body = {"message": 'duplicate key value violates unique constraint "agents_user_slug_active_key"'}
    assert _is_unique_violation(_Response(409, body)) is True


def test_a_non_json_conflict_is_still_a_conflict():
    assert _is_unique_violation(_Response(409, raises=True)) is True


def test_success_is_not_a_violation():
    assert _is_unique_violation(_Response(204, None)) is False


def test_other_errors_are_not_treated_as_slug_conflicts():
    """A 500 must not silently become "try the next suffix"."""
    assert _is_unique_violation(_Response(500, {"code": "XX000"})) is False
    assert _is_unique_violation(_Response(403, {"code": "42501"})) is False


def test_a_conflict_on_a_different_constraint_is_still_retried_safely():
    assert _is_unique_violation(_Response(409, {"code": "23503"})) is False


def test_publish_retries_instead_of_failing():
    """Guard the retry wiring itself."""
    import inspect

    from agent_service.publishing import service

    source = inspect.getsource(service.PublishService._ensure_unique_public_slug)
    assert "_is_unique_violation" in source
    assert "while candidate != current" in source
