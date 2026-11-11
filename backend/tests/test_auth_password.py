from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from app.auth.models import User, UserSession
from app.core.db import get_db
from app.core.security import hash_password, hash_session_token
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.conftest import DEFAULT_TEST_ORIGIN


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app, headers={"Origin": DEFAULT_TEST_ORIGIN})
    finally:
        app.dependency_overrides.clear()


def test_change_password_success_revokes_other_sessions_and_rotates_current(
    client: TestClient,
    db_session: Session,
) -> None:
    email = "change_password_success@linkvault.io"
    old_password = "old_secure_password_123"
    new_password = "new_secure_password_456"

    # 1. Cadastro (Dispositivo A)
    reg_res = client.post(
        "/api/auth/register",
        json={"email": email, "password": old_password},
    )
    assert reg_res.status_code == 201
    cookie_a = reg_res.cookies["linkvault_session"]
    csrf_a = reg_res.json()["csrf_token"]

    # 2. Login adicional (Dispositivo B simulado no banco)
    user = db_session.scalar(select(User).where(User.email == email))
    assert user is not None

    cookie_b_raw = "raw_token_device_b_1234567890123456"
    token_hash_b = hash_session_token(cookie_b_raw)
    future = datetime.now(UTC) + timedelta(days=7)
    session_b = UserSession(
        user_id=user.id,
        token_hash=token_hash_b,
        csrf_token="csrf_token_device_b",
        idle_expires_at=future,
        absolute_expires_at=future,
    )
    db_session.add(session_b)
    db_session.commit()

    # 3. Dispositivo A altera a senha
    client.cookies.set("linkvault_session", cookie_a)
    change_res = client.post(
        "/api/auth/password",
        json={"current_password": old_password, "new_password": new_password},
        headers={"X-CSRF-Token": csrf_a},
    )
    assert change_res.status_code == 200
    data = change_res.json()
    new_csrf = data["csrf_token"]
    assert new_csrf != csrf_a

    cookie_rotated = change_res.cookies["linkvault_session"]
    assert cookie_rotated != cookie_a

    # 4. Sessão do Dispositivo B e token antigo do Dispositivo A foram revogados
    client.cookies.set("linkvault_session", cookie_b_raw)
    res_b = client.get("/api/auth/me")
    assert res_b.status_code == 401

    client.cookies.set("linkvault_session", cookie_a)
    res_old_a = client.get("/api/auth/me")
    assert res_old_a.status_code == 401

    # 5. Nova sessão rotacionada funciona normalmente
    client.cookies.set("linkvault_session", cookie_rotated)
    res_current = client.get("/api/auth/me")
    assert res_current.status_code == 200
    assert res_current.json()["csrf_token"] == new_csrf

    # 6. Senha antiga é rejeitada e nova senha realiza login com sucesso
    login_old = client.post(
        "/api/auth/login",
        json={"email": email, "password": old_password},
    )
    assert login_old.status_code == 401

    login_new = client.post(
        "/api/auth/login",
        json={"email": email, "password": new_password},
    )
    assert login_new.status_code == 200


def test_change_password_wrong_current_password_returns_401(client: TestClient) -> None:
    email = "wrong_pwd@linkvault.io"
    password = "valid_secure_password_123"

    reg_res = client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    csrf_token = reg_res.json()["csrf_token"]

    change_res = client.post(
        "/api/auth/password",
        json={"current_password": "wrong_current_password", "new_password": "new_password_12345"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert change_res.status_code == 401
    assert change_res.headers["content-type"] == "application/problem+json"
    assert change_res.json()["detail"] == "A senha atual está incorreta."

    # Senha original continua válida
    login_res = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200


def test_change_password_rate_limit_blocks_after_5_failures(client: TestClient) -> None:
    email = "rate_limit_password@linkvault.io"
    password = "valid_secure_password_123"

    reg_res = client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    csrf_token = reg_res.json()["csrf_token"]

    # 5 tentativas com senha atual incorreta usando IPs diferentes para acionar o limite por e-mail
    for i in range(1, 6):
        res = client.post(
            "/api/auth/password",
            json={"current_password": "wrong_password", "new_password": "new_password_12345"},
            headers={"X-CSRF-Token": csrf_token, "X-Forwarded-For": f"198.51.100.{i}"},
        )
        assert res.status_code == 401

    # A 6ª tentativa deve ser bloqueada com 429 mesmo com a senha atual correta
    res_blocked = client.post(
        "/api/auth/password",
        json={"current_password": password, "new_password": "new_password_12345"},
        headers={"X-CSRF-Token": csrf_token, "X-Forwarded-For": "198.51.100.99"},
    )
    assert res_blocked.status_code == 429
    assert "Retry-After" in res_blocked.headers
    assert res_blocked.json()["type"] == "urn:linkvault:error:rate_limit_exceeded"


def test_change_password_demo_user_returns_403(
    client: TestClient,
    db_session: Session,
) -> None:
    future = datetime.now(UTC) + timedelta(hours=24)
    demo_user = User(
        email="demo_user_pwd@linkvault.io",
        password_hash=hash_password("valid_secure_password_123"),
        is_demo=True,
        expires_at=future,
    )
    db_session.add(demo_user)
    db_session.flush()

    raw_token = "raw_demo_session_token_12345678"
    demo_session = UserSession(
        user_id=demo_user.id,
        token_hash=hash_session_token(raw_token),
        csrf_token="csrf_demo_token",
        idle_expires_at=future,
        absolute_expires_at=future,
    )
    db_session.add(demo_session)
    db_session.commit()

    client.cookies.set("linkvault_session", raw_token)
    res = client.post(
        "/api/auth/password",
        json={
            "current_password": "valid_secure_password_123",
            "new_password": "new_secure_password_456",
        },
        headers={"X-CSRF-Token": "csrf_demo_token"},
    )
    assert res.status_code == 403
    assert "demonstração" in res.json()["detail"]


def test_change_password_csrf_protection(client: TestClient) -> None:
    reg_res = client.post(
        "/api/auth/register",
        json={"email": "csrf_pwd@linkvault.io", "password": "valid_secure_password_123"},
    )
    assert reg_res.status_code == 201

    # Sem header X-CSRF-Token
    res_no_csrf = client.post(
        "/api/auth/password",
        json={
            "current_password": "valid_secure_password_123",
            "new_password": "new_secure_password_456",
        },
    )
    assert res_no_csrf.status_code == 403
    assert res_no_csrf.json()["type"] == "urn:linkvault:error:csrf_failed"

    # Com header X-CSRF-Token inválido
    res_invalid_csrf = client.post(
        "/api/auth/password",
        json={
            "current_password": "valid_secure_password_123",
            "new_password": "new_secure_password_456",
        },
        headers={"X-CSRF-Token": "invalid_forged_csrf_token"},
    )
    assert res_invalid_csrf.status_code == 403


def test_change_password_policy_and_same_password_returns_422(client: TestClient) -> None:
    email = "policy_pwd@linkvault.io"
    password = "valid_secure_password_123"

    reg_res = client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    csrf_token = reg_res.json()["csrf_token"]

    # 1. Nova senha idêntica à atual
    res_same = client.post(
        "/api/auth/password",
        json={"current_password": password, "new_password": password},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert res_same.status_code == 422
    assert any("diferente" in err["message"] for err in res_same.json()["errors"])

    # 2. Nova senha comum
    res_common = client.post(
        "/api/auth/password",
        json={"current_password": password, "new_password": "password123456"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert res_common.status_code == 422
    assert any("comum" in err["message"] for err in res_common.json()["errors"])

    # 3. Nova senha idêntica ao e-mail
    res_email = client.post(
        "/api/auth/password",
        json={"current_password": password, "new_password": email},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert res_email.status_code == 422
    assert any("idêntica" in err["message"] for err in res_email.json()["errors"])

    # 4. Nova senha muito curta (<12 caracteres, bloqueada no Pydantic)
    res_short = client.post(
        "/api/auth/password",
        json={"current_password": password, "new_password": "short"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert res_short.status_code == 422


def test_change_password_unauthenticated_returns_401(client: TestClient) -> None:
    client.cookies.clear()
    res = client.post(
        "/api/auth/password",
        json={
            "current_password": "any_password_123",
            "new_password": "new_secure_password_456",
        },
    )
    assert res.status_code == 401
    assert res.json()["type"] == "urn:linkvault:error:unauthorized"
