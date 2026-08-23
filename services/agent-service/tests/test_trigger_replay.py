"""One message must not be handled twice because the source was redeployed.

Publishing an agent redeploys its Pipedream source, and Pipedream then replays
recent history under fresh event ids. Dedup keyed on that id let a single
Discord question produce two Trello cards, two Airtable rows, two Notion pages
and two Slack posts — seen live: the "mode sombre" message was processed at
22:17 and again at 22:49 under a different id.
"""

from __future__ import annotations

import json

import pytest

from agent_service.triggers.service import (
    DUPLICATE_WINDOW_SECONDS,
    _content_fingerprint,
    _seen_recently,
)

MESSAGE = {
    "id": "1541209711939162142",
    "timestamp": "2026-08-24T00:17:00Z",
    "channel_id": "1541166631848386756",
    "author": {"username": "stack32_25866"},
    "content": "Petite idee : un mode sombre sur l'application",
}
REPLAY = {**MESSAGE, "id": "1541217779024273468", "timestamp": "2026-08-24T00:49:00Z"}


class FakeClient:
    def __init__(self, rows, status=200):
        self._rows = rows
        self._status = status
        self.params = None

    async def get(self, path, params=None):
        self.params = params

        class R:
            status_code = self._status
            def json(_self):
                return self._rows

        return R()


def test_a_replay_under_a_new_id_has_the_same_fingerprint():
    assert _content_fingerprint(MESSAGE) == _content_fingerprint(REPLAY)


def test_a_different_message_has_a_different_fingerprint():
    other = {**MESSAGE, "content": "autre chose"}
    assert _content_fingerprint(MESSAGE) != _content_fingerprint(other)


def test_a_different_author_is_a_different_event():
    other = {**MESSAGE, "author": {"username": "someone_else"}}
    assert _content_fingerprint(MESSAGE) != _content_fingerprint(other)


def test_the_fingerprint_survives_key_reordering():
    shuffled = dict(reversed(list(MESSAGE.items())))
    assert _content_fingerprint(shuffled) == _content_fingerprint(MESSAGE)


def test_an_unserialisable_payload_still_yields_a_fingerprint():
    assert _content_fingerprint({"x": object()})


@pytest.mark.asyncio
async def test_a_recent_replay_is_recognised():
    client = FakeClient([{"payload": MESSAGE}])
    assert await _seen_recently(client, "t1", _content_fingerprint(REPLAY)) is True


@pytest.mark.asyncio
async def test_a_payload_stored_as_text_is_still_compared():
    client = FakeClient([{"payload": json.dumps(MESSAGE)}])
    assert await _seen_recently(client, "t1", _content_fingerprint(REPLAY)) is True


@pytest.mark.asyncio
async def test_an_unrelated_history_lets_the_event_through():
    client = FakeClient([{"payload": {**MESSAGE, "content": "autre"}}])
    assert await _seen_recently(client, "t1", _content_fingerprint(MESSAGE)) is False


@pytest.mark.asyncio
async def test_the_window_is_bounded_so_old_events_do_not_block_new_ones():
    client = FakeClient([])
    await _seen_recently(client, "t1", "abc")
    assert "created_at" in (client.params or {})


def test_the_window_covers_the_replay_that_was_actually_seen():
    """22:17:17 to 22:49:20 — a quarter-hour window would have missed it."""
    assert DUPLICATE_WINDOW_SECONDS >= 32 * 60


@pytest.mark.asyncio
async def test_a_lookup_failure_never_drops_the_event():
    class Broken:
        async def get(self, *a, **k):
            raise RuntimeError("db down")

    assert await _seen_recently(Broken(), "t1", "abc") is False
