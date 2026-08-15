"""Consistent error envelope and FastAPI exception handlers.

Every error response has the shape:
    {"error": {"code": str, "message": str, "request_id": str}}
Validation errors additionally carry a "details" field.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from agent_service.middleware import REQUEST_ID_HEADER

logger = logging.getLogger(__name__)

# Default error codes per HTTP status for plain HTTPExceptions.
_STATUS_CODES: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
}


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _json_safe_validation_details(errors: list[Any]) -> list[Any]:
    """Strip non-JSON-serializable objects (e.g. Exception in ctx.error) from Pydantic errors."""

    def _sanitize(value: Any) -> Any:
        if isinstance(value, BaseException):
            return str(value)
        if isinstance(value, dict):
            return {k: _sanitize(v) for k, v in value.items()}
        if isinstance(value, list | tuple):
            return [_sanitize(v) for v in value]
        return value

    return jsonable_encoder(_sanitize(errors))


def error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
) -> JSONResponse:
    """Build a JSONResponse following the error envelope contract."""
    request_id = _request_id(request)
    error: dict[str, Any] = {"code": code, "message": message, "request_id": request_id}
    if details is not None:
        error["details"] = details
    return JSONResponse(
        status_code=status_code,
        content={"error": error},
        headers={REQUEST_ID_HEADER: request_id},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach the envelope-producing exception handlers to the app."""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        # A dict detail may override the code/message (used e.g. by auth).
        if isinstance(exc.detail, dict):
            code = exc.detail.get("code", _STATUS_CODES.get(exc.status_code, "http_error"))
            message = exc.detail.get("message", "An error occurred.")
        else:
            code = _STATUS_CODES.get(exc.status_code, "http_error")
            message = str(exc.detail)
        return error_response(request, exc.status_code, code, message)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return error_response(
            request,
            status_code=422,
            code="validation_error",
            message="Request validation failed.",
            details=_json_safe_validation_details(list(exc.errors())),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception while processing request")
        return error_response(
            request,
            status_code=500,
            code="internal_error",
            message="An internal error occurred.",
        )
