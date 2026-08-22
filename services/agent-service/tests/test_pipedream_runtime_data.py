"""Guards for Pipedream runtime data resolution.

Production incident: ``knowledge.py`` resolved its data directory with a
hard-coded ``Path(__file__).resolve().parents[5]``. That index exists in a repo
checkout but not in the container, where the module sits at
``/app/agent_service/integrations/pipedream/`` with only five ancestors — so the
module raised ``IndexError: 5`` at *import* time.

Because nearly every call site imports it lazily inside a ``try``, the failure
was invisible: the Live runtime fell back to ``tool_configs = {}`` (Structure
settings never injected), readiness checks were skipped, and
``/integrations/tools/{id}/reload-props`` returned HTTP 500.

The data also lived in the repo's ``docs/`` tree, outside the ``services/``
Docker build context, so it was never copied into the image at all.
"""

from __future__ import annotations

import inspect
import subprocess
import sys
from pathlib import Path

from agent_service.integrations.pipedream import knowledge


def test_data_dir_ships_inside_the_package():
    """Runtime data must be package data, not docs, or it misses the image."""
    package_dir = Path(knowledge.__file__).resolve().parent
    assert knowledge._DOCS_DIR.is_dir(), knowledge._DOCS_DIR
    assert package_dir in knowledge._DOCS_DIR.parents or knowledge._DOCS_DIR == package_dir / "data"


def test_curated_and_generated_hints_actually_load():
    curated = knowledge.load_app_hints()
    assert isinstance(curated, dict) and len(curated) > 100, len(curated)
    generated = knowledge.load_generated_app_hints()
    assert isinstance(generated, dict) and len(generated) > 500, len(generated)


def test_connect_knowledge_is_real_content_not_the_fallback_string():
    text = knowledge.load_connect_knowledge_markdown()
    assert len(text) > 1000, "fell back to the short hardcoded stub"


def test_resolution_survives_a_shallow_path(tmp_path, monkeypatch):
    """The container layout has fewer ancestors than the repo checkout."""
    monkeypatch.setenv("PIPEDREAM_DOCS_DIR", str(tmp_path))
    assert knowledge._resolve_docs_dir() == tmp_path


def test_resolution_never_searches_ancestor_directories(monkeypatch):
    """A search would let a writable ancestor supply our own configuration.

    Walking up for a matching directory turns a packaging bug into a
    cross-trust-boundary one: a workspace root or a cwd under tenant control
    could shadow the service's data. Only the packaged path, or an explicit
    operator override, is trusted.
    """
    monkeypatch.delenv("PIPEDREAM_DOCS_DIR", raising=False)
    resolved = knowledge._resolve_docs_dir()
    assert resolved == Path(knowledge.__file__).resolve().parent / "data"

    source = inspect.getsource(knowledge._resolve_docs_dir)
    assert ".parents" not in source, "must not walk up looking for a data directory"


def test_missing_runtime_data_is_reported():
    assert knowledge.missing_runtime_data() == []


def test_missing_runtime_data_detects_an_incomplete_image(tmp_path, monkeypatch):
    monkeypatch.setattr(knowledge, "_DOCS_DIR", tmp_path)
    assert set(knowledge.missing_runtime_data()) == set(knowledge.REQUIRED_DATA_FILES)
    (tmp_path / "app_hints.json").write_text("{}", encoding="utf-8")
    assert "app_hints.json" not in knowledge.missing_runtime_data()
    (tmp_path / "CONNECT_KNOWLEDGE.md").write_text("", encoding="utf-8")
    assert "CONNECT_KNOWLEDGE.md" in knowledge.missing_runtime_data(), "empty file is missing data"


def test_tool_config_chain_imports_without_error():
    """The exact lazy-import chain that returned 500 on reload-props."""
    from agent_service.integrations.pipedream.tool_config import (  # noqa: F401
        configured_tools_system_block,
        is_static_prop_configured,
        reload_tool_props_for_structure,
        resolve_agent_tool_configs,
    )


def test_module_imports_cleanly_in_an_isolated_interpreter():
    """Import-time errors here are swallowed by callers; assert on them directly."""
    result = subprocess.run(
        [sys.executable, "-c", "import agent_service.integrations.pipedream.knowledge"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
