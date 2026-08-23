"""Project indexer (M-B).

Builds an in-memory index of a sandbox workspace: file metadata (path, hash,
language), syntactic code chunks (functions/classes for Python, line-windows
otherwise), and a symbol table. Supports incremental re-indexing: when a file's
hash is unchanged, its chunks/symbols are reused.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from agent_service.builder.context.symbols import Symbol, extract_symbols
from agent_service.sandbox.base import SandboxProvider, WorkspaceHandle

_LANG_BY_EXT = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".md": "markdown",
    ".txt": "text",
    ".sql": "sql",
}

_INDEXABLE_EXT = set(_LANG_BY_EXT)
_MAX_INDEX_FILE_BYTES = 400_000


def _lang(path: str) -> str:
    for ext, lang in _LANG_BY_EXT.items():
        if path.endswith(ext):
            return lang
    return "text"


@dataclass(slots=True)
class CodeChunk:
    """A retrievable unit of code."""

    chunk_id: str
    path: str
    start_line: int
    end_line: int
    kind: str  # "function" | "class" | "module" | "window"
    name: str
    content: str
    embedding: list[float] | None = None


@dataclass(slots=True)
class FileRecord:
    path: str
    language: str
    hash: str
    size_bytes: int
    chunk_ids: list[str] = field(default_factory=list)
    symbol_names: list[str] = field(default_factory=list)


@dataclass
class ProjectIndex:
    files: dict[str, FileRecord] = field(default_factory=dict)
    chunks: dict[str, CodeChunk] = field(default_factory=dict)
    symbols: dict[str, list[Symbol]] = field(default_factory=dict)  # name -> defs

    @property
    def file_count(self) -> int:
        return len(self.files)

    @property
    def chunk_count(self) -> int:
        return len(self.chunks)


def _chunk_python(path: str, content: str) -> list[CodeChunk]:
    symbols = extract_symbols(path, content)
    chunks: list[CodeChunk] = []
    lines = content.splitlines()
    if not symbols:
        return _chunk_window(path, content)
    for sym in symbols:
        body = "\n".join(lines[sym.start_line - 1 : sym.end_line])
        cid = f"{path}:{sym.start_line}-{sym.end_line}"
        chunks.append(
            CodeChunk(
                chunk_id=cid,
                path=path,
                start_line=sym.start_line,
                end_line=sym.end_line,
                kind=sym.kind,
                name=sym.name,
                content=body,
            )
        )
    return chunks


def _chunk_window(path: str, content: str, *, window: int = 80) -> list[CodeChunk]:
    lines = content.splitlines()
    chunks: list[CodeChunk] = []
    for i in range(0, max(1, len(lines)), window):
        seg = lines[i : i + window]
        if not seg:
            continue
        start = i + 1
        end = i + len(seg)
        cid = f"{path}:{start}-{end}"
        chunks.append(
            CodeChunk(
                chunk_id=cid,
                path=path,
                start_line=start,
                end_line=end,
                kind="window",
                name=path.rsplit("/", 1)[-1],
                content="\n".join(seg),
            )
        )
    return chunks


def chunk_file(path: str, content: str) -> list[CodeChunk]:
    if path.endswith(".py"):
        return _chunk_python(path, content)
    return _chunk_window(path, content)


def _is_vendored(path: str, root_prefix: str) -> bool:
    """The vendored platform runtime is not the project's code to read."""
    rel = path[len(root_prefix):] if path.startswith(root_prefix) else path
    return rel.lstrip("./").startswith("vendor/")


async def index_workspace(
    provider: SandboxProvider,
    handle: WorkspaceHandle,
    *,
    previous: ProjectIndex | None = None,
    max_files: int = 400,
) -> ProjectIndex:
    """Index (or incrementally re-index) all indexable files in the workspace."""
    index = ProjectIndex()
    entries = await provider.list_files(handle, ".", depth=8)
    root_prefix = handle.root.rstrip("/") + "/"
    count = 0
    for entry in entries:
        if entry.is_dir:
            continue
        if not any(entry.path.endswith(ext) for ext in _INDEXABLE_EXT):
            continue
        if entry.size_bytes and entry.size_bytes > _MAX_INDEX_FILE_BYTES:
            continue
        if count >= max_files:
            break
        count += 1
        try:
            content = await provider.read_file(handle, entry.path)
        except Exception:  # noqa: BLE001
            continue
        # Store workspace-relative paths so callers (edits) use a stable key.
        rel_path = entry.path[len(root_prefix):] if entry.path.startswith(root_prefix) else entry.path
        _ingest_file(index, rel_path, content, previous=previous)
    return index


def _ingest_file(
    index: ProjectIndex,
    path: str,
    content: str,
    *,
    previous: ProjectIndex | None,
) -> None:
    file_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    language = _lang(path)
    # Incremental reuse when unchanged.
    if previous and (prev := previous.files.get(path)) and prev.hash == file_hash:
        index.files[path] = prev
        for cid in prev.chunk_ids:
            if cid in previous.chunks:
                index.chunks[cid] = previous.chunks[cid]
        for name in prev.symbol_names:
            for sym in previous.symbols.get(name, []):
                if sym.path == path:
                    index.symbols.setdefault(name, []).append(sym)
        return

    chunks = chunk_file(path, content)
    symbols = extract_symbols(path, content) if language == "python" else []
    record = FileRecord(
        path=path,
        language=language,
        hash=file_hash,
        size_bytes=len(content.encode("utf-8")),
        chunk_ids=[c.chunk_id for c in chunks],
        symbol_names=[s.name for s in symbols],
    )
    index.files[path] = record
    for c in chunks:
        index.chunks[c.chunk_id] = c
    for s in symbols:
        index.symbols.setdefault(s.name, []).append(s)


def update_file(index: ProjectIndex, path: str, content: str) -> None:
    """Re-index a single file in place (used after an edit)."""
    # Drop old chunks/symbols for the path.
    old = index.files.get(path)
    if old:
        for cid in old.chunk_ids:
            index.chunks.pop(cid, None)
        for name in old.symbol_names:
            remaining = [s for s in index.symbols.get(name, []) if s.path != path]
            if remaining:
                index.symbols[name] = remaining
            else:
                index.symbols.pop(name, None)
    _ingest_file(index, path, content, previous=None)
