"""Unit tests for builder interrupt type derivation."""

from __future__ import annotations

from agent_service.supabase_client import derive_builder_interrupt_type


def test_default_identity():
    assert derive_builder_interrupt_type({}) == "identity"
    assert derive_builder_interrupt_type(None) == "identity"


def test_from_draft_marker():
    assert (
        derive_builder_interrupt_type({"_interrupt_type": "capabilities"}) == "capabilities"
    )
    assert derive_builder_interrupt_type({"_interrupt_type": "connection"}) == "connection"
    assert derive_builder_interrupt_type({"_interrupt_type": "secret"}) == "secret"
    assert derive_builder_interrupt_type({"_interrupt_type": "questions"}) == "questions"
    assert (
        derive_builder_interrupt_type({"_interrupt_type": "tool_review"}) == "tool_review"
    )


def test_explicit_arg_wins():
    assert (
        derive_builder_interrupt_type(
            {"_interrupt_type": "identity"}, interrupt_type="connection"
        )
        == "connection"
    )


def test_explicit_without_draft():
    assert derive_builder_interrupt_type(None, interrupt_type="secret") == "secret"
