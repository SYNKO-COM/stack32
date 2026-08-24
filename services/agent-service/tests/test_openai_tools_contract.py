"""Two OpenAI API changes took every coding model down at once.

A live build failed all four ladder rungs in eight seconds, and the log said
only "err=BadRequestError". The raw messages named the causes: tool names
must match ^[a-zA-Z0-9_-]+$ (our ids carry a namespace dot), and function
tools on chat completions demand an explicit reasoning_effort of "none".
"""

import inspect

from agent_service.builder.coding.tools import build_registry, wire_tool_name


class TestWireNamesSatisfyThePattern:
    def test_every_schema_name_matches_what_openai_accepts(self):
        import re

        pattern = re.compile(r"^[a-zA-Z0-9_-]+$")
        for schema in build_registry().all_schemas():
            name = schema["function"]["name"]
            assert pattern.match(name), name

    def test_the_flattening_is_reversible_enough_to_dispatch(self):
        reg = build_registry()
        for tool_id in reg.ids():
            wire = wire_tool_name(tool_id)
            resolved = reg.get(wire)
            assert resolved is not None, wire
            assert resolved.id == tool_id

    def test_the_real_id_still_resolves_directly(self):
        reg = build_registry()
        assert reg.get("workspace.read_file") is not None

    def test_an_unknown_name_resolves_to_nothing(self):
        assert build_registry().get("does__not__exist") is None


class TestEffortYieldsToTools:
    def test_tools_force_effort_none_on_openai(self):
        from agent_service.gateway import model_gateway

        src = inspect.getsource(model_gateway)
        assert 'kwargs["reasoning_effort"] = "none"' in src

    def test_the_failure_log_carries_the_detail(self):
        from agent_service.gateway import model_gateway

        src = inspect.getsource(model_gateway)
        assert "detail=%s" in src
