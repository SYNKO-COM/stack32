"""A repair that weakens the gate is not a repair.

The loop stops when pytest and ruff pass, which only means something if the
agent cannot redefine "pass". The cheapest escape from a failing build is to
disable the rule, delete the test, or mark it skipped — the gate turns green,
nothing is fixed, and the user gets a "ready" agent that does not work.
"""

from __future__ import annotations

from agent_service.verifier.gate_integrity import detect_weakened_gates, snapshot_gates

PYPROJECT = """
[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
ignore = ["E501"]
"""

TESTS = '''
def test_one():
    assert True


def test_two():
    assert True
'''


def _files(pyproject=PYPROJECT, tests=TESTS, tests_path="tests/test_agent.py"):
    out = [{"path": "pyproject.toml", "content": pyproject}]
    if tests is not None:
        out.append({"path": tests_path, "content": tests})
    return out


def test_an_honest_repair_is_not_flagged():
    before = snapshot_gates(_files())
    after = snapshot_gates(_files(tests=TESTS.replace("assert True", "assert 1 == 1")))
    assert detect_weakened_gates(before, after) == []


def test_adding_a_test_is_never_flagged():
    before = snapshot_gates(_files())
    after = snapshot_gates(_files(tests=TESTS + "\n\ndef test_three():\n    assert True\n"))
    assert detect_weakened_gates(before, after) == []


def test_disabling_a_ruff_rule_is_caught():
    before = snapshot_gates(_files())
    weakened = PYPROJECT.replace('select = ["E", "F", "I", "UP", "B"]', 'select = ["E"]')
    reasons = detect_weakened_gates(before, snapshot_gates(_files(pyproject=weakened)))
    assert any("select lost" in r for r in reasons), reasons


def test_adding_a_ruff_ignore_is_caught():
    before = snapshot_gates(_files())
    weakened = PYPROJECT.replace('ignore = ["E501"]', 'ignore = ["E501", "F401", "B008"]')
    reasons = detect_weakened_gates(before, snapshot_gates(_files(pyproject=weakened)))
    assert any("ignore gained" in r for r in reasons), reasons


def test_deleting_the_test_file_is_caught():
    before = snapshot_gates(_files())
    reasons = detect_weakened_gates(before, snapshot_gates(_files(tests=None)))
    assert any("test file deleted" in r for r in reasons), reasons


def test_removing_a_test_function_is_caught():
    before = snapshot_gates(_files())
    fewer = "\ndef test_one():\n    assert True\n"
    reasons = detect_weakened_gates(before, snapshot_gates(_files(tests=fewer)))
    assert any("tests removed" in r for r in reasons), reasons


def test_marking_a_test_skipped_is_caught():
    before = snapshot_gates(_files())
    skipped = "import pytest\n\n\n@pytest.mark.skip\ndef test_one():\n    assert True\n\n\ndef test_two():\n    assert True\n"
    reasons = detect_weakened_gates(before, snapshot_gates(_files(tests=skipped)))
    assert any("skip/xfail" in r for r in reasons), reasons


def test_xfail_counts_as_weakening_too():
    before = snapshot_gates(_files())
    xfailed = "import pytest\n\n\n@pytest.mark.xfail\ndef test_one():\n    assert True\n\n\ndef test_two():\n    assert True\n"
    reasons = detect_weakened_gates(before, snapshot_gates(_files(tests=xfailed)))
    assert any("skip/xfail" in r for r in reasons), reasons


def test_a_syntax_error_is_left_to_the_build_not_reported_as_tampering():
    before = snapshot_gates(_files())
    broken = "def test_one(:\n    pass\n"
    reasons = detect_weakened_gates(before, snapshot_gates(_files(tests=broken)))
    assert not any("tests removed" in r for r in reasons), reasons


def test_the_repair_loop_rejects_a_weakened_gate():
    """Guard against the wiring being dropped from the pipeline."""
    import inspect

    from agent_service.builder import build_pipeline

    source = inspect.getsource(build_pipeline)
    assert "detect_weakened_gates(gates_before" in source
    assert "REPAIR_WEAKENED_GATES" in source
