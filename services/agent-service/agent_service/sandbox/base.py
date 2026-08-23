"""Provider-neutral isolated coding sandbox abstraction (M-A).

The Stack32 Builder must never execute generated code on the primary Agent
Service host. Every build runs inside an isolated workspace exposed through the
`SandboxProvider` protocol. Concrete backends (E2B, local dev) implement it; the
Builder business logic depends only on this interface.
"""

from __future__ import annotations

import posixpath
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


class SandboxError(Exception):
    """Base error for sandbox operations."""

    code: str = "SANDBOX_ERROR"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        if code:
            self.code = code


class SandboxSecurityError(SandboxError):
    """Raised on a policy violation (path traversal, egress, quota)."""

    code = "SANDBOX_SECURITY"


class SandboxTimeoutError(SandboxError):
    """Raised when a command exceeds its wall-clock budget."""

    code = "SANDBOX_TIMEOUT"


@dataclass(slots=True)
class SandboxConfig:
    """Resource / safety envelope for a workspace."""

    command_timeout_seconds: int = 120
    wall_clock_seconds: int = 900
    max_output_bytes: int = 200_000
    max_file_bytes: int = 2_000_000
    allow_network: bool = False
    template: str = "base"
    env: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class CommandResult:
    """Outcome of a single command execution inside the sandbox."""

    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    truncated: bool = False

    @property
    def ok(self) -> bool:
        return self.exit_code == 0


@dataclass(slots=True)
class FileEntry:
    """A single entry returned by `list_files`."""

    path: str
    is_dir: bool
    size_bytes: int = 0


@dataclass(slots=True)
class WorkspaceHandle:
    """Opaque reference to a live/paused workspace."""

    provider: str
    workspace_id: str
    root: str = "/workspace"
    metadata: dict[str, Any] = field(default_factory=dict)


def normalize_project_path(root: str, path: str) -> str:
    """Resolve `path` under `root`, rejecting traversal / absolute escapes.

    Returns a POSIX path guaranteed to live under `root`. This is the single
    choke point every backend must call before touching the filesystem.
    """
    if path is None:
        raise SandboxSecurityError("Empty path", code="SANDBOX_PATH")
    raw = str(path).strip()
    if not raw:
        raise SandboxSecurityError("Empty path", code="SANDBOX_PATH")
    # Reject NUL and obvious traversal tokens early for clear errors.
    if "\x00" in raw:
        raise SandboxSecurityError("Illegal NUL in path", code="SANDBOX_PATH")
    root_norm = posixpath.normpath(root)
    normalized_raw = posixpath.normpath(raw)
    if normalized_raw == root_norm or normalized_raw.startswith(root_norm + "/"):
        # Already a workspace-rooted path (e.g. from list_files) — keep as-is.
        candidate = normalized_raw
    else:
        # Treat absolute-looking inputs as relative to the workspace root.
        rel = raw[1:] if raw.startswith("/") else raw
        candidate = posixpath.normpath(posixpath.join(root_norm, rel))
    if candidate != root_norm and not candidate.startswith(root_norm + "/"):
        raise SandboxSecurityError(
            f"Path escapes workspace root: {path!r}", code="SANDBOX_PATH"
        )
    return candidate


@runtime_checkable
class SandboxProvider(Protocol):
    """Isolated coding workspace backend.

    All methods are async. File paths are relative to the workspace root and are
    confined via `normalize_project_path`.
    """

    name: str

    async def create_workspace(self, config: SandboxConfig) -> WorkspaceHandle: ...

    async def resume_workspace(self, handle: WorkspaceHandle) -> WorkspaceHandle: ...

    async def destroy_workspace(self, handle: WorkspaceHandle) -> None: ...

    async def snapshot_workspace(self, handle: WorkspaceHandle) -> str: ...

    async def read_file(self, handle: WorkspaceHandle, path: str) -> str: ...

    async def write_file(self, handle: WorkspaceHandle, path: str, content: str) -> None: ...

    async def delete_file(self, handle: WorkspaceHandle, path: str) -> None: ...

    async def list_files(
        self, handle: WorkspaceHandle, path: str = ".", *, depth: int = 3
    ) -> list[FileEntry]: ...

    async def run_command(
        self,
        handle: WorkspaceHandle,
        command: list[str],
        *,
        cwd: str = ".",
        timeout_seconds: int | None = None,
    ) -> CommandResult: ...


def truncate_output(text: str, cap: int) -> str:
    """Keep both ends of oversized output.

    Head-only truncation drops exactly what the repair loop needs: pytest and
    ruff print their verdict ("4 failed, 317 passed", "Found 6 errors") on the
    final line, so a large run lost its summary and the progress parser saw
    nothing — reading as "no progress" and stalling the loop. The first failure
    is usually near the top and the verdict is always at the bottom, so keep
    both and mark the gap.
    """
    if cap <= 0 or len(text) <= cap:
        return text
    marker = "\n... [output truncated] ...\n"
    if cap <= len(marker):
        return text[-cap:]
    budget = cap - len(marker)
    head = budget // 3
    tail = budget - head
    return text[:head] + marker + text[-tail:]
