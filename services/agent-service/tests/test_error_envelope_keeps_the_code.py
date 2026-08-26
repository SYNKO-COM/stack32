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
