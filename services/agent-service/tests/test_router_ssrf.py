import pytest

from agent_service.gateway.model_gateway import ModelProfile
from agent_service.gateway.router import TaskComplexity, TaskType, detect_complexity, route_profile
from agent_service.security.ssrf import UnsafeURLError, validate_public_http_url
from agent_service.tools.runtime import ToolError, _safe_eval


def test_route_intent_is_fast():
    assert route_profile(TaskType.INTENT_CLASSIFICATION) == ModelProfile.FAST


def test_route_architecture_is_coding():
    assert route_profile(TaskType.ARCHITECTURE) == ModelProfile.CODING


def test_low_budget_downgrades_reasoning_but_not_coding():
    """Budget pressure must never lower the coding/repair capability floor.

    A cheaper repair model produces worse patches, which costs *more* by
    burning extra repair iterations. Exhaustion is enforced hard at the router
    layer (BudgetExceeded in routers/builder.py, live.py, secrets.py) instead
    of silently degrading quality here.
    """
    assert route_profile(TaskType.REPAIR, budget_remaining_usd=0.1) == ModelProfile.CODING
    assert route_profile(TaskType.ARCHITECTURE, budget_remaining_usd=0.1) == ModelProfile.CODING


def test_budget_threshold_is_strict():
    """0.5 is the boundary and must NOT trigger a downgrade (< 0.5, not <=)."""
    at_threshold = route_profile(TaskType.INTENT_CLASSIFICATION, budget_remaining_usd=0.5)
    assert at_threshold == route_profile(TaskType.INTENT_CLASSIFICATION)


def test_detect_complexity_fast_path():
    assert detect_complexity("rename the agent", is_first_build=False) == TaskComplexity.FAST


def test_detect_complexity_heavy_first_build():
    assert detect_complexity("build a research agent", is_first_build=True) == TaskComplexity.HEAVY


def test_ssrf_blocks_localhost():
    with pytest.raises(UnsafeURLError):
        validate_public_http_url("http://localhost/admin")


def test_ssrf_blocks_metadata():
    with pytest.raises(UnsafeURLError):
        validate_public_http_url("http://169.254.169.254/latest/meta-data")


def test_ssrf_blocks_non_http():
    with pytest.raises(UnsafeURLError):
        validate_public_http_url("file:///etc/passwd")


def test_calculator_safe_eval():
    assert _safe_eval("2 + 3 * 4") == 14


def test_calculator_rejects_names():
    with pytest.raises(ToolError):
        _safe_eval("__import__('os').system('id')")
