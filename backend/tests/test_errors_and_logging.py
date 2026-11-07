import json
import logging

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
import pytest

from app.core.errors import (
    NotFoundError,
    ProblemDetail,
    RateLimitExceededError,
    register_exception_handlers,
)
from app.core.logging import (
    REQUEST_ID_HEADER,
    JsonLogFormatter,
    RequestContextMiddleware,
    resolve_request_id,
    set_request_id,
)
from app.main import app

client = TestClient(app)


def test_request_id_generated_and_returned_in_header() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert REQUEST_ID_HEADER in response.headers
    generated_id = response.headers[REQUEST_ID_HEADER]
    assert len(generated_id) > 10


def test_valid_request_id_is_preserved() -> None:
    custom_id = "trace-client-12345"
    response = client.get("/api/health", headers={REQUEST_ID_HEADER: custom_id})
    assert response.status_code == 200
    assert response.headers[REQUEST_ID_HEADER] == custom_id


def test_invalid_request_id_is_replaced() -> None:
    malicious_header = "invalid\nid-with-newline"
    response = client.get("/api/health", headers={REQUEST_ID_HEADER: malicious_header})
    assert response.status_code == 200
    returned_id = response.headers[REQUEST_ID_HEADER]
    assert returned_id != malicious_header
    assert "\n" not in returned_id


def test_404_not_found_returns_problem_details() -> None:
    response = client.get("/api/non-existent-endpoint")
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert REQUEST_ID_HEADER in response.headers

    data = response.json()
    assert data["status"] == 404
    assert data["title"] == "Não encontrado"
    assert data["type"] == "urn:linkvault:error:http_error"
    assert data["request_id"] == response.headers[REQUEST_ID_HEADER]
    assert data["instance"] == "/api/non-existent-endpoint"


def test_validation_error_returns_clean_problem_details() -> None:
    test_app = FastAPI()
    test_app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(test_app)

    class DummyPayload(BaseModel):
        email: str = Field(min_length=5)
        age: int = Field(ge=18)

    @test_app.post("/test-validation")
    def dummy_post(payload: DummyPayload) -> dict[str, str]:
        return {"status": "ok"}

    local_client = TestClient(test_app)
    response = local_client.post("/test-validation", json={"email": "abc", "age": 10})

    assert response.status_code == 422
    assert response.headers["content-type"] == "application/problem+json"

    data = response.json()
    assert data["status"] == 422
    assert data["title"] == "Erro de validação"
    assert data["type"] == "urn:linkvault:error:validation_error"
    assert "errors" in data
    assert len(data["errors"]) == 2

    fields = {item["field"] for item in data["errors"]}
    assert fields == {"email", "age"}


def test_domain_app_error_and_rate_limit_header() -> None:
    test_app = FastAPI()
    test_app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(test_app)

    @test_app.get("/test-not-found")
    def raise_not_found() -> None:
        raise NotFoundError(detail="Coleção não encontrada.")

    @test_app.get("/test-rate-limit")
    def raise_rate_limit() -> None:
        raise RateLimitExceededError(detail="Limite atingido.", retry_after=120)

    local_client = TestClient(test_app)

    res_404 = local_client.get("/test-not-found")
    assert res_404.status_code == 404
    assert res_404.json()["detail"] == "Coleção não encontrada."
    assert res_404.json()["type"] == "urn:linkvault:error:not_found"

    res_429 = local_client.get("/test-rate-limit")
    assert res_429.status_code == 429
    assert res_429.headers.get("Retry-After") == "120"
    assert res_429.json()["status"] == 429
    assert res_429.json()["type"] == "urn:linkvault:error:rate_limit_exceeded"


def test_unhandled_500_exception_masks_internal_details() -> None:
    test_app = FastAPI()
    test_app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(test_app)

    @test_app.get("/test-internal-error")
    def raise_internal() -> None:
        raise RuntimeError("Database connection secret error")

    local_client = TestClient(test_app, raise_server_exceptions=False)
    response = local_client.get("/test-internal-error")

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/problem+json"

    data = response.json()
    assert data["status"] == 500
    assert data["title"] == "Erro interno do servidor"
    assert "secret" not in data["detail"]
    assert data["type"] == "urn:linkvault:error:internal_server_error"


def test_json_log_formatter_serializes_valid_json() -> None:
    formatter = JsonLogFormatter()
    set_request_id("req-trace-999")

    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Operação realizada com sucesso",
        args=(),
        exc_info=None,
    )
    record.event_data = {"user_id": "usr-123"}  # type: ignore[attr-defined]

    raw_json = formatter.format(record)
    parsed = json.loads(raw_json)

    assert parsed["level"] == "INFO"
    assert parsed["message"] == "Operação realizada com sucesso"
    assert parsed["request_id"] == "req-trace-999"
    assert parsed["user_id"] == "usr-123"
    assert "timestamp" in parsed