"""A typed refusal must survive the error envelope.

Routes raise ``HTTPException(status, detail={"code", "message", "fields"})``.
The global handler rewraps that as ``{"error": {...}}`` — and used to drop
``fields`` on the floor, and the web client only read ``detail``, so every
typed refusal (plan limits included) reached the UI as a generic failure.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from agent_service.errors import register_exception_handlers


def _app() -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/limited")
    async def limited():
        raise HTTPException(
            status_code=402,
            detail={"code": "PLAN_WAKE_LIMIT", "message": "Three wakes on free."},
        )

    @app.get("/missing")
    async def missing():
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CONFIG_REQUIRED",
                "message": "Settings missing.",
                "fields": ["board", "idList"],
            },
        )

    return TestClient(app, raise_server_exceptions=False)


class TestTheEnvelopeCarriesWhatTheRouteSaid:
    def test_the_code_and_status_survive(self):
        response = _app().get("/limited")
        assert response.status_code == 402
        body = response.json()["error"]
        assert body["code"] == "PLAN_WAKE_LIMIT"
        assert body["message"] == "Three wakes on free."

    def test_named_fields_survive_as_details(self):
        response = _app().get("/missing")
        assert response.status_code == 400
        body = response.json()["error"]
        assert body["code"] == "CONFIG_REQUIRED"
        assert body["details"]["fields"] == ["board", "idList"]


class TestAnEmptyProviderBalanceIsNamed:
    """"No credits remaining" is a billing fact, not a key problem."""

    def _live(self) -> str:
        import pathlib as _p

        return (
            _p.Path(__file__).resolve().parents[1]
            / "agent_service/runtime/live.py"
        ).read_text()

    def test_the_balance_error_gets_its_own_code(self):
        live = self._live()
        assert '"MODEL_PROVIDER_OUT_OF_CREDITS"' in live
        assert "live:errors.providerOutOfCredits" in live

    def test_it_is_classified_before_the_generic_provider_error(self):
        live = self._live()
        assert live.index("no credits remaining") < live.index(
            '"MODEL_PROVIDER_UNAVAILABLE"'
        )

    def test_both_locales_explain_where_to_top_up(self):
        import json
        import pathlib as _p

        web = _p.Path(__file__).resolve().parents[3] / "apps/web/locales"
        for lang in ("fr", "en"):
            data = json.loads((web / lang / "live.json").read_text())
            msg = data["errors"]["providerOutOfCredits"]
            assert "platform.openai.com" in msg
