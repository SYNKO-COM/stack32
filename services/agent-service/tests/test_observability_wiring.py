"""Error reporting must actually be installed, not merely configured.

Production ran for weeks with no error reporting at all. The Sentry init code
was correct and a stack32-production-sentry-dsn secret existed, but two links
were missing: the DSN was never mounted into Cloud Run, and sentry-sdk lived in
the `observability` extra while the image installed only `[gcp,sandbox]`. Even
setting the DSN would have hit the "sdk not installed" branch and returned.

That is why the publish outage and the Pipedream IndexError had to be found by
reading Cloud Run logs by hand instead of arriving as alerts.
"""

from __future__ import annotations

import pathlib
import tomllib

SERVICE_ROOT = pathlib.Path(__file__).resolve().parents[1]


def test_sentry_sdk_is_declared_in_the_observability_extra():
    data = tomllib.loads((SERVICE_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    extras = data["project"]["optional-dependencies"]
    assert any("sentry-sdk" in dep for dep in extras["observability"])


def test_the_image_installs_the_observability_extra():
    dockerfile = (SERVICE_ROOT / "Dockerfile").read_text(encoding="utf-8")
    install_line = next(
        line for line in dockerfile.splitlines() if '".[' in line and "pip install" not in line
    )
    assert "observability" in install_line, (
        "the image must install the observability extra, or SENTRY_DSN is inert"
    )


def test_sentry_init_is_a_no_op_without_a_dsn():
    """Local and CI runs must not need a DSN."""
    from types import SimpleNamespace

    from agent_service.main import _maybe_init_sentry

    _maybe_init_sentry(SimpleNamespace(SENTRY_DSN="", ENVIRONMENT="test"))
