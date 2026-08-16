"""Local sandbox backend — DEV/TEST ONLY.

Runs commands under a confined temporary directory with strict path
confinement, argv-only execution (no shell), wall-clock timeouts and output
caps. It provides a testable/demoable path when no E2B key is present. It is
FORBIDDEN in production (enforced in `config.Settings`), because it shares the
host kernel and filesystem namespace.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path

from agent_service.sandbox.base import (
    CommandResult,
    FileEntry,
    SandboxConfig,
    SandboxSecurityError,
    SandboxTimeoutError,
    WorkspaceHandle,
    normalize_project_path,
)

_ROOT = "/workspace"


class LocalSandbox:
    """Confined local filesystem + subprocess backend."""

    name = "local"

    def __init__(self) -> None:
        self._dirs: dict[str, str] = {}
        self._configs: dict[str, SandboxConfig] = {}

    # --- lifecycle ---------------------------------------------------------
    async def create_workspace(self, config: SandboxConfig) -> WorkspaceHandle:
        wsid = f"local-{uuid.uuid4().hex[:12]}"
        base = tempfile.mkdtemp(prefix="stack32-sbx-")
        self._dirs[wsid] = base
        self._configs[wsid] = config
        return WorkspaceHandle(provider=self.name, workspace_id=wsid, root=_ROOT, metadata={"host_dir": base})

    async def resume_workspace(self, handle: WorkspaceHandle) -> WorkspaceHandle:
        host = handle.metadata.get("host_dir")
        if host and os.path.isdir(host):
            self._dirs[handle.workspace_id] = host
            self._configs.setdefault(handle.workspace_id, SandboxConfig())
            return handle
        return await self.create_workspace(self._configs.get(handle.workspace_id, SandboxConfig()))

    async def destroy_workspace(self, handle: WorkspaceHandle) -> None:
        host = self._dirs.pop(handle.workspace_id, None) or handle.metadata.get("host_dir")
        self._configs.pop(handle.workspace_id, None)
        if host and os.path.isdir(host):
            shutil.rmtree(host, ignore_errors=True)

    async def snapshot_workspace(self, handle: WorkspaceHandle) -> str:
        # A snapshot for the local backend is a content-addressed tar-less copy
        # marker; the durable snapshot lives in the DB (agent_project_files).
        return f"local-snap-{uuid.uuid4().hex[:12]}"

    # --- filesystem --------------------------------------------------------
    def _host_path(self, handle: WorkspaceHandle, path: str) -> Path:
        base = self._dirs.get(handle.workspace_id) or handle.metadata.get("host_dir")
        if not base:
            raise SandboxSecurityError("Unknown workspace", code="SANDBOX_STATE")
        # Confine against the virtual root, then rebase to the host dir.
        confined = normalize_project_path(handle.root, path)
        rel = confined[len(handle.root):].lstrip("/")
        host = Path(base) / rel
        # Defense in depth: ensure the realpath stays inside base.
        base_real = os.path.realpath(base)
        host_real = os.path.realpath(host)
        if host_real != base_real and not host_real.startswith(base_real + os.sep):
            raise SandboxSecurityError("Path escapes workspace root", code="SANDBOX_PATH")
        return host

    async def read_file(self, handle: WorkspaceHandle, path: str) -> str:
        host = self._host_path(handle, path)
        cfg = self._configs.get(handle.workspace_id, SandboxConfig())
        if not host.is_file():
            raise SandboxSecurityError(f"Not a file: {path}", code="SANDBOX_NOT_FOUND")
        if host.stat().st_size > cfg.max_file_bytes:
            raise SandboxSecurityError("File exceeds size cap", code="SANDBOX_SIZE")
        return host.read_text(encoding="utf-8", errors="replace")

    async def write_file(self, handle: WorkspaceHandle, path: str, content: str) -> None:
        cfg = self._configs.get(handle.workspace_id, SandboxConfig())
        data = content.encode("utf-8")
        if len(data) > cfg.max_file_bytes:
            raise SandboxSecurityError("File exceeds size cap", code="SANDBOX_SIZE")
        host = self._host_path(handle, path)
        host.parent.mkdir(parents=True, exist_ok=True)
        host.write_bytes(data)

    async def delete_file(self, handle: WorkspaceHandle, path: str) -> None:
        host = self._host_path(handle, path)
        if host.is_dir():
            shutil.rmtree(host, ignore_errors=True)
        elif host.exists():
            host.unlink()

    async def list_files(
        self, handle: WorkspaceHandle, path: str = ".", *, depth: int = 3
    ) -> list[FileEntry]:
        base = self._host_path(handle, path)
        if not base.exists():
            return []
        base_dir = self._dirs.get(handle.workspace_id) or handle.metadata["host_dir"]
        out: list[FileEntry] = []
        base_depth = len(Path(base).parts)
        for root, dirs, files in os.walk(base):
            rel_depth = len(Path(root).parts) - base_depth
            if rel_depth >= depth:
                dirs[:] = []
            # Skip noisy virtualenv/cache dirs.
            dirs[:] = [d for d in dirs if d not in {".git", "__pycache__", ".venv", "node_modules"}]
            for d in dirs:
                p = Path(root) / d
                out.append(FileEntry(path=self._vpath(base_dir, p, handle.root), is_dir=True))
            for f in files:
                p = Path(root) / f
                try:
                    size = p.stat().st_size
                except OSError:
                    size = 0
                out.append(FileEntry(path=self._vpath(base_dir, p, handle.root), is_dir=False, size_bytes=size))
        out.sort(key=lambda e: e.path)
        return out

    @staticmethod
    def _vpath(base_dir: str, p: Path, root: str) -> str:
        rel = os.path.relpath(str(p), base_dir).replace(os.sep, "/")
        return f"{root}/{rel}" if rel != "." else root

    # --- execution ---------------------------------------------------------
    async def run_command(
        self,
        handle: WorkspaceHandle,
        command: list[str],
        *,
        cwd: str = ".",
        timeout_seconds: int | None = None,
    ) -> CommandResult:
        if not command or not isinstance(command, list):
            raise SandboxSecurityError("Command must be a non-empty argv list", code="SANDBOX_CMD")
        cfg = self._configs.get(handle.workspace_id, SandboxConfig())
        binary = command[0].rsplit("/", 1)[-1]
        if not cfg.allow_network and binary in {
            "curl",
            "wget",
            "nc",
            "ncat",
            "netcat",
            "ssh",
            "scp",
            "ftp",
            "telnet",
        }:
            raise SandboxSecurityError(
                "Network tools are disabled in this sandbox",
                code="SANDBOX_NETWORK",
            )
        timeout = min(timeout_seconds or cfg.command_timeout_seconds, cfg.wall_clock_seconds)
        workdir = self._host_path(handle, cwd)
        if not workdir.is_dir():
            workdir.mkdir(parents=True, exist_ok=True)

        # Dev-only: expose the running interpreter (with pytest/ruff) so
        # `python`/`python3` resolve inside the confined workspace. Production
        # uses E2B, which ships its own toolchain.
        import sys

        interp_dir = os.path.dirname(sys.executable)
        base_path = os.environ.get("PATH", "/usr/bin:/bin")
        env = {
            "PATH": f"{interp_dir}{os.pathsep}{base_path}",
            "HOME": str(workdir),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(workdir),
            **cfg.env,
        }
        start = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(
                *command,
                cwd=str(workdir),
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            return CommandResult(
                exit_code=127,
                stdout="",
                stderr=f"command not found: {command[0]} ({exc})",
                duration_ms=0,
            )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except TimeoutError as exc:
            proc.kill()
            await proc.wait()
            raise SandboxTimeoutError(
                f"Command timed out after {timeout}s: {command[0]}"
            ) from exc
        duration_ms = int((time.monotonic() - start) * 1000)
        cap = cfg.max_output_bytes
        stdout = stdout_b.decode("utf-8", errors="replace")
        stderr = stderr_b.decode("utf-8", errors="replace")
        truncated = len(stdout) > cap or len(stderr) > cap
        return CommandResult(
            exit_code=proc.returncode if proc.returncode is not None else -1,
            stdout=stdout[:cap],
            stderr=stderr[:cap],
            duration_ms=duration_ms,
            truncated=truncated,
        )
