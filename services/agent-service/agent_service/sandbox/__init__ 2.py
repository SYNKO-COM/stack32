"""Isolated coding sandbox package (M-A)."""

from agent_service.sandbox.base import (
    CommandResult,
    FileEntry,
    SandboxConfig,
    SandboxError,
    SandboxProvider,
    SandboxSecurityError,
    SandboxTimeoutError,
    WorkspaceHandle,
    normalize_project_path,
)
from agent_service.sandbox.manager import SandboxManager, build_provider, config_from_settings

__all__ = [
    "CommandResult",
    "FileEntry",
    "SandboxConfig",
    "SandboxError",
    "SandboxProvider",
    "SandboxSecurityError",
    "SandboxTimeoutError",
    "WorkspaceHandle",
    "normalize_project_path",
    "SandboxManager",
    "build_provider",
    "config_from_settings",
]
