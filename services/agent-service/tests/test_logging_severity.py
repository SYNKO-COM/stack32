"""Cloud Logging reads "severity", not "level".

Emitting only "level" meant every ERROR landed with default severity, so
`severity>=ERROR` matched nothing and production errors were invisible in Cloud
Logging. With Sentry also unconfigured, the sandbox build failures in this
release had to be found by grepping raw text payloads by hand.
"""

from __future__ import annotations

import json
import logging

from agent_service.logging_config import JSONFormatter


def _emit(level: int, msg: str = "boom") -> dict:
    record = logging.LogRecord("t", level, __file__, 1, msg, None, None)
    return json.loads(JSONFormatter().format(record))


def test_errors_carry_a_cloud_logging_severity():
    payload = _emit(logging.ERROR)
    assert payload["severity"] == "ERROR"


def test_every_level_maps_to_a_valid_severity():
    valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
    for level in (logging.DEBUG, logging.INFO, logging.WARNING, logging.ERROR, logging.CRITICAL):
        assert _emit(level)["severity"] in valid


def test_level_is_kept_for_local_readers():
    assert _emit(logging.WARNING)["level"] == "WARNING"


def test_the_message_survives_formatting():
    assert _emit(logging.INFO, "hello")["message"] == "hello"
