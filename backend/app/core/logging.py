import json
import logging
import re
import sys
import time
import uuid
from contextvars import ContextVar, Token
from datetime import UTC, datetime
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER: str = "X-Request-ID"
_SAFE_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

request_id_ctx_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    return request_id_ctx_var.get()


def set_request_id(request_id: str) -> Token[str | None]:
    return request_id_ctx_var.set(request_id)


def reset_request_id(token: Token[str | None]) -> None:
    request_id_ctx_var.reset(token)


def resolve_request_id(header_value: str | None) -> str:
    if header_value and _SAFE_REQUEST_ID_RE.match(header_value):
        return header_value
    return str(uuid.uuid7())


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": get_request_id(),
        }

        event_data = getattr(record, "event_data", None)
        if isinstance(event_data, dict):
            payload.update(event_data)

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


def configure_logging(log_level: str = "INFO") -> None:
    root_logger = logging.getLogger()
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger.setLevel(numeric_level)

    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(numeric_level)
    handler.setFormatter(JsonLogFormatter())
    root_logger.addHandler(handler)

    for noisy_logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        noisy_logger = logging.getLogger(noisy_logger_name)
        noisy_logger.handlers.clear()
        noisy_logger.propagate = True


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        raw_header = request.headers.get(REQUEST_ID_HEADER)
        request_id = resolve_request_id(raw_header)
        request.state.request_id = request_id
        token = set_request_id(request_id)

        start_time = time.perf_counter()
        logger = logging.getLogger("app.access")

        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            response.headers[REQUEST_ID_HEADER] = request_id

            logger.info(
                "http.request.completed",
                extra={
                    "event_data": {
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "duration_ms": duration_ms,
                    }
                },
            )
            return response
        finally:
            reset_request_id(token)
