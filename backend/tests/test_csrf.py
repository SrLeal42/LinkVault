from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from app.auth.dependencies import CurrentSession
from app.auth.models import User, UserSession
from app.core.db import get_db
from app.core.security import hash_password, hash_session_token
from app.main import app
from fastapi import APIRouter
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import DEFAULT_TEST_ORIGIN

router_for_csrf_test = APIRouter(prefix="/api/test-csrf", tags=["test"])


@router_for_csrf_test.post("/protected")
def dummy_protected_mutation(current_session: CurrentSession) -> dict[str, str]:
    return {"status": "ok", "user_id": str(current_session.user.id)}


app.include_router(router_for_csrf_test)


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


# ==============================================================================
# Camada 2: Origin e Referer
# ==============================================================================


def test_post_without_origin_and_without_referer_returns_403(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login",
        json={"email": "any@linkvault.io", "password": "password123456"},
    )
    assert res.status_code == 403
    assert res.headers["content-type"] == "application/problem+json"
    data = res.json()
    assert data["type"] == "urn:linkvault:error:csrf_failed"
    assert "Origin ou Referer" in data["detail"]


def test_post_with_untrusted_origin_returns_403(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login",
        json={"email": "any@linkvault.io", "password": "password123456"},
        headers={"Origin": "https://evil-attacker.com"},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "Origem da requisição não permitida."


def test_post_with_null_origin_returns_403(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login",
        json={"email": "any@linkvault.io", "password": "password123456"},
        headers={"Origin": "null"},
    )
    assert res.status_code == 403


def test_post_with_valid_referer_fallback_is_accepted(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login",
        json={"email": "any@linkvault.io", "password": "password123456"},
        headers={"Referer": f"{DEFAULT_TEST_ORIGIN}/login?redirect=/library"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "E-mail ou senha inválidos."


def test_safe_get_without_origin_is_permitted(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.status_code == 200


# ==============================================================================
# Camada 3: Content-Type
# ==============================================================================


def test_post_with_form_urlencoded_returns_403(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login",
        content="email=any%40linkvault.io&password=password123456",
        headers={
            "Origin": DEFAULT_TEST_ORIGIN,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    assert res.status_code == 403
    assert "application/json" in res.json()["detail"]


def test_post_with_text_plain_returns_403(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login",
        content='{"email": "any@linkvault.io", "password": "password123456"}',
        headers={
            "Origin": DEFAULT_TEST_ORIGIN,
            "Content-Type": "text/plain",
        },
    )
    assert res.status_code == 403


def test_post_with_json_and_charset_is_accepted(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login",
        content='{"email": "any@linkvault.io", "password": "password123456"}',
        headers={
            "Origin": DEFAULT_TEST_ORIGIN,
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    assert res.status_code == 401


# ==============================================================================
# Camada 4: Synchronizer Token (X-CSRF-Token)
# ==============================================================================


def test_protected_mutation_without_csrf_token_returns_403(
    client: TestClient, db_session: Session
) -> None:
    reg_res = client.post(
        "/api/auth/register",
        json={"email": "csrf_guard@linkvault.io", "password": "valid_secure_password_123"},
        headers={"Origin": DEFAULT_TEST_ORIGIN},
    )
    assert reg_res.status_code == 201

    res = client.post(
        "/api/test-csrf/protected",
        headers={"Origin": DEFAULT_TEST_ORIGIN},
    )
    assert res.status_code == 403
    assert "Token CSRF" in res.json()["detail"]


def test_protected_mutation_with_invalid_csrf_token_returns_403(client: TestClient) -> None:
    reg_res = client.post(
        "/api/auth/register",
        json={"email": "csrf_invalid@linkvault.io", "password": "valid_secure_password_123"},
        headers={"Origin": DEFAULT_TEST_ORIGIN},
    )
    assert reg_res.status_code == 201

    res = client.post(
        "/api/test-csrf/protected",
        headers={
            "Origin": DEFAULT_TEST_ORIGIN,
            "X-CSRF-Token": "invalid_forged_csrf_token_12345",
        },
    )
    assert res.status_code == 403


def test_protected_mutation_with_valid_csrf_token_succeeds(client: TestClient) -> None:
    reg_res = client.post(
        "/api/auth/register",
        json={"email": "csrf_valid@linkvault.io", "password": "valid_secure_password_123"},
        headers={"Origin": DEFAULT_TEST_ORIGIN},
    )
    assert reg_res.status_code == 201
    csrf_token = reg_res.json()["csrf_token"]

    res = client.post(
        "/api/test-csrf/protected",
        headers={
            "Origin": DEFAULT_TEST_ORIGIN,
            "X-CSRF-Token": csrf_token,
        },
    )
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


# ==============================================================================
# Proteção de Logout contra CSRF e Idempotência
# ==============================================================================


def test_logout_with_active_session_without_csrf_returns_403_and_preserves_session(
    client: TestClient, db_session: Session
) -> None:
    reg_res = client.post(
        "/api/auth/register",
        json={"email": "logout_csrf@linkvault.io", "password": "valid_secure_password_123"},
        headers={"Origin": DEFAULT_TEST_ORIGIN},
    )
    assert reg_res.status_code == 201
    raw_cookie = reg_res.cookies["linkvault_session"]
    token_hash = hash_session_token(raw_cookie)

    res = client.post("/api/auth/logout", headers={"Origin": DEFAULT_TEST_ORIGIN})
    assert res.status_code == 403
    assert "Token CSRF" in res.json()["detail"]

    session_in_db = db_session.scalar(
        select(UserSession).where(UserSession.token_hash == token_hash)
    )
    assert session_in_db is not None


def test_logout_with_active_session_and_valid_csrf_token_succeeds(
    client: TestClient, db_session: Session
) -> None:
    reg_res = client.post(
        "/api/auth/register",
        json={"email": "logout_ok@linkvault.io", "password": "valid_secure_password_123"},
        headers={"Origin": DEFAULT_TEST_ORIGIN},
    )
    assert reg_res.status_code == 201
    csrf_token = reg_res.json()["csrf_token"]
    raw_cookie = reg_res.cookies["linkvault_session"]
    token_hash = hash_session_token(raw_cookie)

    res = client.post(
        "/api/auth/logout",
        headers={"Origin": DEFAULT_TEST_ORIGIN, "X-CSRF-Token": csrf_token},
    )
    assert res.status_code == 204

    session_in_db = db_session.scalar(
        select(UserSession).where(UserSession.token_hash == token_hash)
    )
    assert session_in_db is None


def test_logout_without_cookie_is_idempotent_even_without_csrf(client: TestClient) -> None:
    res = client.post("/api/auth/logout", headers={"Origin": DEFAULT_TEST_ORIGIN})
    assert res.status_code == 204


def test_logout_with_expired_session_is_idempotent_without_csrf(
    client: TestClient, db_session: Session
) -> None:
    user = User(email="expired_logout@linkvault.io", password_hash=hash_password("pw1234567890"))
    db_session.add(user)
    db_session.flush()

    raw_token = "expired_logout_token_raw"
    token_hash = hash_session_token(raw_token)
    past_date = datetime.now(UTC) - timedelta(hours=1)

    expired_session = UserSession(
        user_id=user.id,
        token_hash=token_hash,
        csrf_token="csrf_token_val",
        idle_expires_at=past_date,
        absolute_expires_at=past_date,
    )
    db_session.add(expired_session)
    db_session.flush()

    client.cookies.set("linkvault_session", raw_token)
    res = client.post("/api/auth/logout", headers={"Origin": DEFAULT_TEST_ORIGIN})
    assert res.status_code == 204

    assert (
        db_session.scalar(select(UserSession).where(UserSession.token_hash == token_hash)) is None
    )
