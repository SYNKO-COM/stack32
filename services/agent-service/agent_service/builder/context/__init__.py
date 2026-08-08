"""Builder coding context engine (M-B)."""

from agent_service.builder.context.budget import BudgetAllocation, allocate, estimate_tokens, fit_to_budget
from agent_service.builder.context.compaction import CompactionResult, compact_history
from agent_service.builder.context.diagnostics import (
    Diagnostic,
    parse_pytest_output,
    parse_ruff_output,
    summarize,
    syntax_diagnostics,
)
from agent_service.builder.context.engine import ContextEngine, RetrievalResult
from agent_service.builder.context.indexer import (
    CodeChunk,
    FileRecord,
    ProjectIndex,
    chunk_file,
    index_workspace,
    update_file,
)
from agent_service.builder.context.retriever import GrepMatch, RetrievedChunk, grep, semantic_search
from agent_service.builder.context.symbols import (
    Symbol,
    extract_imports,
    extract_symbols,
    find_references,
)

__all__ = [
    "BudgetAllocation",
    "allocate",
    "estimate_tokens",
    "fit_to_budget",
    "CompactionResult",
    "compact_history",
    "Diagnostic",
    "parse_pytest_output",
    "parse_ruff_output",
    "summarize",
    "syntax_diagnostics",
    "ContextEngine",
    "RetrievalResult",
    "CodeChunk",
    "FileRecord",
    "ProjectIndex",
    "chunk_file",
    "index_workspace",
    "update_file",
    "GrepMatch",
    "RetrievedChunk",
    "grep",
    "semantic_search",
    "Symbol",
    "extract_imports",
    "extract_symbols",
    "find_references",
]
