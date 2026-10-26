"""Use the SDK's actual non-zero-exit exception, as returned by real E2B."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from e2b import CommandExitException

from agent_service.builder.runtime_vendor import prepare_verification_runtime
from agent_service.sandbox.base import SandboxError, WorkspaceHandle
from agent_service.sandbox.e2b import E2BSandbox


def workspace(side_effect):
    provider = E2BSandbox(api_key="unused-test-key")
    handle = WorkspaceHandle(provider="e2b", workspace_id="qa", root="/home/user/workspace")
    run = AsyncMock(side_effect=side_effect)
    provider._live[handle.workspace_id] = SimpleNamespace(commands=SimpleNamespace(run=run))
    return provider, handle, run


async def test_nonzero_exit_preserves_diagnostics_instead_of_raising():
    provider, handle, _ = workspace(CommandExitException(
        stdout="one test failed", stderr="timeout is the assertion's text", exit_code=1, error=None,
    ))
    result = await provider.run_command(handle, ["python", "-m", "pytest"])
    assert result.exit_code == 1 and not result.ok
    assert result.stdout == "one test failed"
    assert result.stderr == "timeout is the assertion's text"


async def test_real_sdk_probe_failure_reaches_platform_dependency_install(monkeypatch):
    provider, handle, run = workspace([
        CommandExitException(stdout="", stderr="No module named pytest", exit_code=1, error=None),
        SimpleNamespace(stdout="installed", stderr="", exit_code=0),
    ])
    monkeypatch.setattr(provider, "write_file", AsyncMock())
    await prepare_verification_runtime(provider, handle)
    assert run.await_count == 2
    install = run.call_args.args[0]
    assert "pip install" in install and "pytest" in install
    assert "stack32-agent-runtime" not in install


async def test_transport_failure_still_raises_a_sandbox_error():
    provider, handle, _ = workspace(RuntimeError("sandbox transport unavailable"))
    with pytest.raises(SandboxError) as caught:
        await provider.run_command(handle, ["python", "-m", "pytest"])
    assert caught.value.code == "SANDBOX_EXEC"
