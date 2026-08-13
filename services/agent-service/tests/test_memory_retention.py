"""M3 — memory retention helpers and provider abstraction."""

from __future__ import annotations

from datetime import UTC, datetime

from agent_service.memory.providers import (
    MemoryProvider,
    Stack32MemoryProvider,
    get_memory_provider,
)
from agent_service.memory.service import compute_expires_at


def test_compute_expires_at_none_for_zero_or_missing():
    assert compute_expires_at(None) is None
    assert compute_expires_at(0) is None
    assert compute_expires_at(-5) is None


def test_compute_expires_at_offsets_by_days():
    now = datetime(2026, 1, 1, tzinfo=UTC)
    iso = compute_expires_at(90, now=now)
    assert iso is not None
    parsed = datetime.fromisoformat(iso)
    assert (parsed - now).days == 90
    assert parsed.tzinfo is not None


def test_stack32_provider_satisfies_protocol():
    provider = get_memory_provider("stack32")
    assert isinstance(provider, Stack32MemoryProvider)
    assert isinstance(provider, MemoryProvider)
    assert provider.name == "stack32"


def test_unknown_provider_falls_back_to_stack32():
    assert isinstance(get_memory_provider("does_not_exist"), Stack32MemoryProvider)
    assert isinstance(get_memory_provider(None), Stack32MemoryProvider)
