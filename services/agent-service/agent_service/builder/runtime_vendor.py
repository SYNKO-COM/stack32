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
