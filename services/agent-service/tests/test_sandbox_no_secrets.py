"""No platform secret may ever enter a sandbox workspace.

`allow_network=False` blocks a denylist of eleven binaries, but the coding
agent needs `python` to run pytest and ruff, so a generated project can always
reach the network via urllib. Egress is therefore best-effort, and the property
that actually contains the blast radius is this one: a workspace holds only the
user's own generated code, never an API key. If that ever stops being true, the
weak egress control becomes a real exfiltration path.
"""

from __future__ import annotations

import inspect

from agent_service.sandbox.base import SandboxConfig
from agent_service.sandbox.e2b import E2BSandbox
from agent_service.sandbox.manager import build_provider


def test_e2b_workspace_creation_passes_no_environment():
    source = inspect.getsource(E2BSandbox.create_workspace)
    assert "env" not in source, (
        "create_workspace must not forward environment variables into the sandbox"
    )
    assert "api_key=self._api_key" in source


def test_sandbox_config_defaults_to_no_env_and_no_network():
    cfg = SandboxConfig()
    assert cfg.env == {}
    assert cfg.allow_network is False


def test_manager_never_injects_secrets_into_the_config():
    source = inspect.getsource(build_provider)
    for secret in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY",
                   "SECRETS_ENCRYPTION_KEY", "PIPEDREAM_CLIENT_SECRET", "DATABASE_URL"):
        assert secret not in source, f"{secret} must never reach a sandbox"


def test_denylist_is_documented_as_best_effort_not_isolation():
    """Stop a future reader from mistaking the denylist for containment."""
    source = inspect.getsource(E2BSandbox)
    assert "NOT network isolation" in source
