"""Context engine facade (M-B).

Ties the indexer, symbol graph, retriever, diagnostics and budget together into
one object the Builder orchestrator can call. Embeds chunks lazily via the model
gateway (embedding profile) and caches embeddings so a single edit re-embeds
only changed chunks.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from agent_service.builder.context.budget import BudgetAllocation, fit_to_budget
from agent_service.builder.context.indexer import (
    ProjectIndex,
    index_workspace,
    update_file,
)
from agent_service.builder.context.retriever import (
    GrepMatch,
    RetrievedChunk,
    grep,
    semantic_search,
)
from agent_service.builder.context.symbols import Symbol
from agent_service.sandbox.base import SandboxProvider, WorkspaceHandle


@dataclass
class RetrievalResult:
    chunks: list[RetrievedChunk] = field(default_factory=list)
    definitions: list[Symbol] = field(default_factory=list)
    grep_hits: list[GrepMatch] = field(default_factory=list)

    def render(self, allocation: BudgetAllocation | None = None) -> str:
        parts: list[str] = []
        if self.definitions:
            parts.append("# Relevant symbols")
            for s in self.definitions[:12]:
                parts.append(f"- {s.kind} {s.name} ({s.path}:{s.start_line})")
        if self.chunks:
            parts.append("\n# Relevant code")
            for r in self.chunks:
                header = f"## {r.chunk.path}:{r.chunk.start_line}-{r.chunk.end_line} ({r.reason})"
                parts.append(header)
                parts.append(r.chunk.content)
        text = "\n".join(parts)
        if allocation is not None:
            text, _ = fit_to_budget(text, allocation.per_category_tokens.get("code", 4000))
        return text


class ContextEngine:
    def __init__(self, provider: SandboxProvider, handle: WorkspaceHandle, gateway=None) -> None:
        self.provider = provider
        self.handle = handle
        self.gateway = gateway
        self.index = ProjectIndex()
        self._embedded = False

    async def build(self, *, previous: ProjectIndex | None = None) -> ProjectIndex:
        self.index = await index_workspace(self.provider, self.handle, previous=previous)
        self._embedded = False
        return self.index

    async def on_file_written(self, path: str, content: str) -> None:
        update_file(self.index, path, content)
        self._embedded = False

    async def _ensure_embeddings(self) -> None:
        if self._embedded or self.gateway is None:
            return
        pending = [c for c in self.index.chunks.values() if c.embedding is None]
        if not pending:
            self._embedded = True
            return
        try:
            vectors = await self.gateway.embed([c.content[:2000] for c in pending])
        except Exception:  # noqa: BLE001
            self._embedded = True  # degrade to lexical
            return
        for chunk, vec in zip(pending, vectors, strict=False):
            chunk.embedding = vec
        self._embedded = True

    def grep(self, pattern: str, *, glob: str | None = None, limit: int = 100) -> list[GrepMatch]:
        return grep(self.index, pattern, glob=glob, limit=limit)

    def find_symbol(self, name: str) -> list[Symbol]:
        return list(self.index.symbols.get(name, []))

    async def retrieve(self, objective: str, *, limit: int = 8) -> RetrievalResult:
        await self._ensure_embeddings()
        query_embedding: list[float] | None = None
        if self.gateway is not None:
            try:
                query_embedding = (await self.gateway.embed([objective]))[0]
            except Exception:  # noqa: BLE001
                query_embedding = None
        chunks = semantic_search(self.index, objective, query_embedding, limit=limit)
        # Pull direct definitions for symbols mentioned in the objective.
        defs: list[Symbol] = []
        for token in objective.replace("(", " ").replace(")", " ").split():
            defs.extend(self.index.symbols.get(token, []))
        return RetrievalResult(chunks=chunks, definitions=defs[:12], grep_hits=[])

    def allocation(self, max_model_tokens: int = 128_000, reserved_output_tokens: int = 8_000) -> BudgetAllocation:
        from agent_service.builder.context.tiers import tiered_allocation

        _ = max_model_tokens
        _ = reserved_output_tokens
        return tiered_allocation(complexity="moderate")
