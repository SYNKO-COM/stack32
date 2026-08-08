"""Context retrieval (M-B).

Combines lexical (regex/grep) and semantic (embedding) search over the project
index. Semantic search degrades gracefully to lexical scoring when embeddings
are unavailable. Retrieval follows the playbook sequence: classify -> lexical +
semantic -> definitions -> diagnostics outrank when a file/line is implicated.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from agent_service.builder.context.indexer import CodeChunk, ProjectIndex


@dataclass(slots=True)
class GrepMatch:
    path: str
    line: int
    text: str


@dataclass(slots=True)
class RetrievedChunk:
    chunk: CodeChunk
    score: float
    reason: str


def grep(index: ProjectIndex, pattern: str, *, glob: str | None = None, limit: int = 100) -> list[GrepMatch]:
    """Exact/regex search across indexed chunk content."""
    try:
        rx = re.compile(pattern)
    except re.error:
        rx = re.compile(re.escape(pattern))
    glob_rx = _glob_to_regex(glob) if glob else None
    matches: list[GrepMatch] = []
    for record in index.files.values():
        if glob_rx and not glob_rx.match(record.path):
            continue
        for cid in record.chunk_ids:
            chunk = index.chunks.get(cid)
            if not chunk:
                continue
            for offset, line in enumerate(chunk.content.splitlines()):
                if rx.search(line):
                    matches.append(
                        GrepMatch(path=chunk.path, line=chunk.start_line + offset, text=line.strip()[:300])
                    )
                    if len(matches) >= limit:
                        return matches
    return matches


def _glob_to_regex(glob: str) -> re.Pattern[str]:
    # Minimal glob: ** matches any path, * matches within a segment.
    esc = re.escape(glob).replace(r"\*\*", ".*").replace(r"\*", "[^/]*").replace(r"\?", ".")
    return re.compile(f"^{esc}$")


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _lexical_score(query: str, chunk: CodeChunk) -> float:
    terms = [t for t in re.split(r"\W+", query.lower()) if len(t) > 2]
    if not terms:
        return 0.0
    body = chunk.content.lower()
    name = chunk.name.lower()
    score = 0.0
    for t in terms:
        score += body.count(t) * 0.5
        if t in name:
            score += 3.0
    return score / (1 + len(chunk.content) / 2000.0)


def semantic_search(
    index: ProjectIndex,
    query: str,
    query_embedding: list[float] | None,
    *,
    limit: int = 8,
) -> list[RetrievedChunk]:
    """Rank chunks by embedding cosine when available, else lexical score."""
    scored: list[RetrievedChunk] = []
    for chunk in index.chunks.values():
        if query_embedding and chunk.embedding:
            sim = _cosine(query_embedding, chunk.embedding)
            lex = _lexical_score(query, chunk)
            scored.append(RetrievedChunk(chunk=chunk, score=sim + 0.1 * lex, reason="semantic"))
        else:
            lex = _lexical_score(query, chunk)
            if lex > 0:
                scored.append(RetrievedChunk(chunk=chunk, score=lex, reason="lexical"))
    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:limit]
