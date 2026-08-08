import pytest

from agent_service.gateway.model_gateway import ModelProfile
from agent_service.gateway.router import TaskComplexity, TaskType, detect_complexity, route_profile
from agent_service.security.ssrf import UnsafeURLError, validate_public_http_url
from agent_service.tools.runtime import ToolError, _safe_eval


def test_route_intent_is_fast():
    assert route_profile(TaskType.INTENT_CLASSIFICATION) == ModelProfile.FAST


def test_route_architecture_is_coding():
    assert route_profile(TaskType.ARCHITECTURE) == ModelProfile.CODING


def test_budget_forces_cheaper_profile():
    assert (
        route_profile(TaskType.REPAIR, budget_remaining_usd=0.5) == ModelProfile.BALANCED
    )


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
