"""Ship stack32-agent-runtime into the sandbox alongside the generated project.

Every generated agent imports ``stack32_agent_runtime``, but the E2B sandbox runs
a stock Python image where that package does not exist — it is a monorepo package,
not something on PyPI. So ``pytest`` failed at import on *every* build, the coding
agent spent its whole turn budget shelling out to ``pip download`` and ``find /``
trying to conjure the dependency, and the run ended with the sandbox
"soft skipped" while still reporting the agent as built.

Copying the installed package into the workspace fixes the cause instead of
asking the model to work around it. It costs ~112 KB and no network.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

VENDOR_DIR = "vendor"
_PACKAGE = "stack32_agent_runtime"


def _package_root() -> Path | None:
    try:
        import stack32_agent_runtime  # noqa: PLC0415 - optional at import time
    except ImportError:
        logger.warning("stack32_agent_runtime is not importable; sandbox will lack the runtime")
        return None
    init = getattr(stack32_agent_runtime, "__file__", None)
    return Path(init).resolve().parent if init else None


def runtime_files() -> list[dict[str, str]]:
    """Return the runtime's ``.py`` files as sandbox-relative writes."""
    root = _package_root()
    if root is None or not root.is_dir():
        return []
    out: list[dict[str, str]] = []
    for path in sorted(root.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        rel = path.relative_to(root).as_posix()
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            logger.warning("could not read runtime file %s", rel)
            continue
        out.append({"path": f"{VENDOR_DIR}/{_PACKAGE}/{rel}", "content": content})
    if not out:
        logger.warning("stack32_agent_runtime resolved to %s but contained no modules", root)
    return out


async def vendor_runtime_into(provider, handle) -> int:
    """Write the runtime into the workspace. Returns the number of files written."""
    files = runtime_files()
    for entry in files:
        await provider.write_file(handle, entry["path"], entry["content"])
    return len(files)


async def prepare_verification_runtime(provider, handle) -> None:
    """Provide platform code on every fresh workspace, including snapshot repair."""
    from agent_service.sandbox.base import SandboxError

    if not await vendor_runtime_into(provider, handle):
        raise SandboxError("Platform runtime is unavailable", code="SANDBOX_RUNTIME_MISSING")
    if provider.name != "e2b":
        return
    check = await provider.run_command(
        handle, ["python", "-c", "import pytest, pytest_asyncio, ruff, pydantic"],
        timeout_seconds=30,
    )
    if check.ok:
        return
    # Only fixed platform dependencies; never install a generated project's
    # pyproject, which references the private, already-vendored runtime.
    installed = await provider.run_command(
        handle,
        ["python", "-m", "pip", "install", "--disable-pip-version-check",
         "pytest>=8,<10", "pytest-asyncio>=0.24,<2", "ruff>=0.6,<1", "pydantic>=2.7,<3"],
        timeout_seconds=120,
    )
    if not installed.ok:
        raise SandboxError("Verification dependencies could not be prepared", code="SANDBOX_BOOTSTRAP_FAILED")
