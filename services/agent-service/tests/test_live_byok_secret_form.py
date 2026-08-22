"""Both BYOK gates must hand the user a way to supply their LLM key.

Observed in production: sending a Live message on an agent without an LLM key
returned "Un problème est survenu pendant l'exécution. Réessayez." The runtime
gate reported only {"tone", "code"} with no ui_component, so the client had
nothing to render and the user had no path forward — while the very same
condition on the entry gate did return a secret_form.
"""

from __future__ import annotations

from types import SimpleNamespace

from agent_service.runtime.live import llm_configuration_required_metadata


def _spec(provider="anthropic", model_id="claude-sonnet-5"):
    return SimpleNamespace(model=SimpleNamespace(provider=provider, model_id=model_id))


def test_metadata_carries_a_secret_form():
    meta = llm_configuration_required_metadata(_spec(), "inst-1")
    assert meta["code"] == "LLM_CONFIGURATION_REQUIRED"
    component = meta["ui_component"]
    assert component["type"] == "secret_form"
    assert component["installation_id"] == "inst-1"
    assert {f["key"] for f in component["fields"]} == {"provider", "model_id"}


def test_form_is_prefilled_from_the_agent_spec():
    meta = llm_configuration_required_metadata(_spec(), None)
    fields = {f["key"]: f for f in meta["ui_component"]["fields"]}
    assert fields["provider"]["suggested_value"] == "anthropic"
    assert fields["model_id"]["suggested_value"] == "claude-sonnet-5"


def test_defaults_are_safe_when_the_spec_has_no_model():
    meta = llm_configuration_required_metadata(SimpleNamespace(model=None), None)
    fields = {f["key"]: f for f in meta["ui_component"]["fields"]}
    assert fields["provider"]["suggested_value"] == "openai"
    assert fields["model_id"]["suggested_value"] == ""


def test_each_prompt_gets_a_distinct_request_id():
    a = llm_configuration_required_metadata(_spec(), None)["ui_component"]["request_id"]
    b = llm_configuration_required_metadata(_spec(), None)["ui_component"]["request_id"]
    assert a != b


def test_both_gates_use_the_shared_builder():
    """Guard against one gate drifting back to a bare error payload."""
    import inspect

    from agent_service.runtime import live

    source = inspect.getsource(live)
    assert source.count("metadata=llm_configuration_required_metadata(") == 2
