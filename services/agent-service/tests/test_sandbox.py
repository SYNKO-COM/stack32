"""M-A: sandbox security + lifecycle tests (local backend)."""

from __future__ import annotations

import pytest

from agent_service.sandbox.base import (
    SandboxConfig,
    SandboxSecurityError,
    SandboxTimeoutError,
    normalize_project_path,
)
from agent_service.sandbox.local import LocalSandbox


def test_normalize_rejects_traversal():
    root = "/workspace"
    with pytest.raises(SandboxSecurityError):
        normalize_project_path(root, "../etc/passwd")
    with pytest.raises(SandboxSecurityError):
        normalize_project_path(root, "a/../../b")
    with pytest.raises(SandboxSecurityError):
        normalize_project_path(root, "")


def test_normalize_confines_absolute():
    root = "/workspace"
    # Absolute inputs are treated relative to root, never as host paths.
    assert normalize_project_path(root, "/etc/passwd") == "/workspace/etc/passwd"
    assert normalize_project_path(root, "src/agent/main.py") == "/workspace/src/agent/main.py"


@pytest.fixture
async def sbx():
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig(command_timeout_seconds=5))
    yield provider, handle
    await provider.destroy_workspace(handle)


async def test_write_read_roundtrip(sbx):
    provider, handle = sbx
    await provider.write_file(handle, "src/hello.py", "print('hi')\n")
    content = await provider.read_file(handle, "src/hello.py")
    assert "print('hi')" in content


async def test_read_traversal_blocked(sbx):
    provider, handle = sbx
    with pytest.raises(SandboxSecurityError):
        await provider.read_file(handle, "../../../etc/passwd")


async def test_list_files(sbx):
    provider, handle = sbx
    await provider.write_file(handle, "a.txt", "1")
    await provider.write_file(handle, "pkg/b.txt", "2")
    entries = await provider.list_files(handle, ".")
    paths = {e.path for e in entries}
    assert any(p.endswith("/a.txt") for p in paths)
    assert any(p.endswith("/pkg") for p in paths)


async def test_run_command_ok(sbx):
    provider, handle = sbx
    result = await provider.run_command(handle, ["python3", "-c", "print(2 + 2)"])
    assert result.ok
    assert result.stdout.strip() == "4"


async def test_run_command_timeout(sbx):
    provider, handle = sbx
    with pytest.raises(SandboxTimeoutError):
        await provider.run_command(
            handle, ["python3", "-c", "import time; time.sleep(30)"], timeout_seconds=1
        )


async def test_run_command_requires_argv(sbx):
    provider, handle = sbx
    with pytest.raises(SandboxSecurityError):
        await provider.run_command(handle, "echo hi")  # type: ignore[arg-type]


async def test_output_capped():
    provider = LocalSandbox()
    handle = await provider.create_workspace(SandboxConfig(max_output_bytes=100))
    try:
        result = await provider.run_command(
            handle, ["python3", "-c", "print('x' * 5000)"]
        )
        assert len(result.stdout) <= 100
        assert result.truncated
    finally:
        await provider.destroy_workspace(handle)


async def test_command_in_confined_dir(sbx):
    provider, handle = sbx
    await provider.write_file(handle, "note.txt", "data")
    result = await provider.run_command(handle, ["ls"])
    assert "note.txt" in result.stdout
