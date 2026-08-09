"""Milestone 2 — memory extraction + knowledge text extractors."""

from __future__ import annotations

import pytest

from agent_service.knowledge.extract import ExtractionError, extract_text
from agent_service.memory.service import extract_memory_candidate
from agent_service.models.agent_spec import ToolBinding
from agent_service.models.graph_spec import default_linear_graph


def test_extract_memory_explicit_english():
    assert extract_memory_candidate(
        "Please remember that my favorite color is blue", policy="explicit"
    ) == "my favorite color is blue"


def test_extract_memory_explicit_french():
    assert extract_memory_candidate(
        "Souviens-toi que je préfère le café", policy="explicit"
    ) == "je préfère le café"


def test_extract_memory_never():
    assert extract_memory_candidate("remember that X", policy="never") is None


def test_extract_memory_no_trigger():
    assert extract_memory_candidate("What is the weather?", policy="explicit") is None


def test_extract_txt():
    text, meta = extract_text(
        filename="notes.txt", mime_type="text/plain", data=b"Hello knowledge base"
    )
    assert "Hello knowledge" in text
    assert meta["format"] == "txt"


def test_extract_csv():
    data = b"name,role\nAda,engineer\n"
    text, meta = extract_text(filename="team.csv", mime_type="text/csv", data=data)
    assert "Ada" in text
    assert meta["format"] == "csv"


def test_extract_pdf_ocr_required_empty():
    # Minimal invalid/empty PDF should fail clearly (not silently succeed).
    with pytest.raises(ExtractionError) as exc:
        extract_text(filename="scan.pdf", mime_type="application/pdf", data=b"%PDF-1.4 empty")
    assert exc.value.code in {"PDF_PARSE_FAILED", "PDF_OCR_REQUIRED", "PDF_EXTRACTOR_UNAVAILABLE"}


def test_default_linear_graph_includes_memory_and_knowledge():
    graph = default_linear_graph(
        [ToolBinding(tool_id="calculator")],
        knowledge_enabled=True,
        memory_enabled=True,
    )
    types = {n.type for n in graph.nodes}
    assert "memory_read" in types
    assert "memory_write" in types
    assert "knowledge" in types
