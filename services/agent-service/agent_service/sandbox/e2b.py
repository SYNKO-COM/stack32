"""E2B sandbox backend — production isolated Firecracker microVMs.

Uses the official `e2b` Python SDK (imported lazily so the dependency stays
optional for environments that only use the local backend). Wraps the async
sandbox API: filesystem, commands, pause/resume, snapshots. All paths are
confined via `normalize_project_path`.

Docs: https://e2b.dev/docs — SDK: `pip install e2b`.
"""

from __future__ import annotations

import time
import uuid

from agent_service.sandbox.base import (
    CommandResult,
    FileEntry,
    SandboxConfig,
    SandboxError,
    SandboxSecurityError,
    SandboxTimeoutError,
    WorkspaceHandle,
    normalize_project_path,
)

_ROOT = "/home/user/workspace"


def _rel(handle: WorkspaceHandle, path: str) -> str:
    """Confine then return an absolute path inside the sandbox root."""
    return normalize_project_path(handle.root, path)


class E2BSandbox:
    """Isolated cloud sandbox backed by E2B."""

    name = "e2b"
    _NETWORK_BINARIES = frozenset(
        {"curl", "wget", "nc", "ncat", "netcat", "ssh", "scp", "ftp", "telnet", "dig", "nslookup"}
    )

    def __init__(self, *, api_key: str, template: str = "base") -> None:
        if not api_key:
            raise SandboxError("E2B_API_KEY is required for the e2b backend", code="SANDBOX_CONFIG")
        self._api_key = api_key
        self._template = template
        self._live: dict[str, object] = {}
        self._configs: dict[str, SandboxConfig] = {}

    def _load_sdk(self):  # pragma: no cover - thin import shim
        try:
            from e2b import AsyncSandbox  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise SandboxError(
                "e2b SDK not installed. Run `pip install e2b`.", code="SANDBOX_SDK"
            ) from exc
        return AsyncSandbox

    async def create_workspace(self, config: SandboxConfig) -> WorkspaceHandle:
        AsyncSandbox = self._load_sdk()
        sbx = await AsyncSandbox.create(
            template=config.template or self._template,
            api_key=self._api_key,
            timeout=config.wall_clock_seconds,
        )
        wsid = getattr(sbx, "sandbox_id", None) or f"e2b-{uuid.uuid4().hex[:12]}"
        self._live[wsid] = sbx
        self._configs[wsid] = config
        await sbx.files.make_dir(_ROOT)  # type: ignore[attr-defined]
        return WorkspaceHandle(provider=self.name, workspace_id=wsid, root=_ROOT)

    async def resume_workspace(self, handle: WorkspaceHandle) -> WorkspaceHandle:
        AsyncSandbox = self._load_sdk()
        sbx = await AsyncSandbox.connect(handle.workspace_id, api_key=self._api_key)
        self._live[handle.workspace_id] = sbx
        return handle

    async def _get(self, handle: WorkspaceHandle):
        sbx = self._live.get(handle.workspace_id)
        if sbx is None:
            await self.resume_workspace(handle)
            sbx = self._live[handle.workspace_id]
        return sbx

    async def destroy_workspace(self, handle: WorkspaceHandle) -> None:
        sbx = self._live.pop(handle.workspace_id, None)
        if sbx is not None:
            await sbx.kill()  # type: ignore[attr-defined]

    async def snapshot_workspace(self, handle: WorkspaceHandle) -> str:
        sbx = await self._get(handle)
        # Filesystem+memory snapshot; survives sandbox deletion.
        snap_id = await sbx.pause()  # type: ignore[attr-defined]
        return str(snap_id)

    async def read_file(self, handle: WorkspaceHandle, path: str) -> str:
        sbx = await self._get(handle)
        abs_path = _rel(handle, path)
        return await sbx.files.read(abs_path)  # type: ignore[attr-defined]

    async def write_file(self, handle: WorkspaceHandle, path: str, content: str) -> None:
        cfg = self._configs.get(handle.workspace_id) or SandboxConfig()
        if len(content.encode("utf-8")) > cfg.max_file_bytes:
            raise SandboxSecurityError("File exceeds size cap", code="SANDBOX_SIZE")
        sbx = await self._get(handle)
        abs_path = _rel(handle, path)
        await sbx.files.write(abs_path, content)  # type: ignore[attr-defined]

    async def delete_file(self, handle: WorkspaceHandle, path: str) -> None:
        sbx = await self._get(handle)
        abs_path = _rel(handle, path)
        await sbx.files.remove(abs_path)  # type: ignore[attr-defined]

    async def list_files(
        self, handle: WorkspaceHandle, path: str = ".", *, depth: int = 3
    ) -> list[FileEntry]:
        sbx = await self._get(handle)
        abs_path = _rel(handle, path)
        entries = await sbx.files.list(abs_path)  # type: ignore[attr-defined]
        out: list[FileEntry] = []
        for e in entries:
            is_dir = getattr(e, "type", None) == "dir" or getattr(e, "is_dir", False)
            out.append(
                FileEntry(
                    path=getattr(e, "path", str(e)),
                    is_dir=bool(is_dir),
                    size_bytes=int(getattr(e, "size", 0) or 0),
                )
            )
        return out

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
        cfg = self._configs.get(handle.workspace_id) or SandboxConfig()
        binary = command[0].rsplit("/", 1)[-1]
        if not cfg.allow_network and binary in self._NETWORK_BINARIES:
            raise SandboxSecurityError(
                "Network tools are disabled in this sandbox",
                code="SANDBOX_NETWORK",
            )
        sbx = await self._get(handle)
        workdir = _rel(handle, cwd)
        timeout = min(timeout_seconds or cfg.command_timeout_seconds, cfg.wall_clock_seconds)
        # Prefer argv arrays; E2B commands.run accepts a string, so join safely.
        import shlex

        cmd_str = " ".join(shlex.quote(part) for part in command)
        start = time.monotonic()
        try:
            res = await sbx.commands.run(  # type: ignore[attr-defined]
                cmd_str, cwd=workdir, timeout=timeout
            )
        except Exception as exc:  # noqa: BLE001
            msg = str(exc).lower()
            if "timeout" in msg or "timed out" in msg:
                raise SandboxTimeoutError(f"Command timed out: {command[0]}") from exc
            raise SandboxError(f"E2B command failed: {exc}", code="SANDBOX_EXEC") from exc
        duration_ms = int((time.monotonic() - start) * 1000)
        cap = cfg.max_output_bytes
        stdout = str(getattr(res, "stdout", "") or "")
        stderr = str(getattr(res, "stderr", "") or "")
        exit_code = int(getattr(res, "exit_code", 0) or 0)
        return CommandResult(
            exit_code=exit_code,
            stdout=stdout[:cap],
            stderr=stderr[:cap],
            duration_ms=duration_ms,
            truncated=len(stdout) > cap or len(stderr) > cap,
        )
