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


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_get_me_success_with_active_cookie(client: TestClient) -> None:
    reg_res = client.post(
        "/api/auth/register",
        json={"email": "session_me@linkvault.io", "password": "valid_secure_password_123"},
    )
    assert reg_res.status_code == 201
    csrf_token = reg_res.json()["csrf_token"]

    response = client.get("/api/auth/me")
    assert response.status_code == 200

    data = response.json()
    assert data["user"]["email"] == "session_me@linkvault.io"
    assert data["csrf_token"] == csrf_token


def test_get_me_without_cookie_returns_401(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["detail"] == "Autenticação necessária."


def test_get_me_with_forged_cookie_returns_401(client: TestClient) -> None:
    client.cookies.set("linkvault_session", "invalid_forged_cookie_token_12345")
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Sessão inválida ou expirada."


def test_get_me_idle_expired_session_is_deleted_and_returns_401(
    client: TestClient, db_session: Session
) -> None:
    user = User(email="idle_expired@linkvault.io", password_hash=hash_password("pw1234567890"))
    db_session.add(user)
    db_session.flush()

    raw_token = "raw_idle_expired_token_12345"
    token_hash = hash_session_token(raw_token)
    past_date = datetime.now(UTC) - timedelta(hours=1)
    future_date = datetime.now(UTC) + timedelta(days=30)

    user_session = UserSession(
        user_id=user.id,
        token_hash=token_hash,
        csrf_token="csrf_test",
        idle_expires_at=past_date,
        absolute_expires_at=future_date,
    )
    db_session.add(user_session)
    db_session.flush()
    session_id = user_session.id

    client.cookies.set("linkvault_session", raw_token)
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Sessão inválida ou expirada."

    # Verifica remoção imediata no banco
    assert db_session.scalar(select(UserSession).where(UserSession.id == session_id)) is None


def test_get_me_absolute_expired_session_is_deleted_and_returns_401(
    client: TestClient, db_session: Session
) -> None:
    user = User(email="abs_expired@linkvault.io", password_hash=hash_password("pw1234567890"))
    db_session.add(user)
    db_session.flush()

    raw_token = "raw_abs_expired_token_12345"
    token_hash = hash_session_token(raw_token)
    past_date = datetime.now(UTC) - timedelta(hours=1)
    future_date = datetime.now(UTC) + timedelta(days=7)

    user_session = UserSession(
        user_id=user.id,
        token_hash=token_hash,
        csrf_token="csrf_test",
        idle_expires_at=future_date,
        absolute_expires_at=past_date,
    )
    db_session.add(user_session)
    db_session.flush()
    session_id = user_session.id

    client.cookies.set("linkvault_session", raw_token)
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Sessão inválida ou expirada."

    # Verifica remoção imediata no banco
    assert db_session.scalar(select(UserSession).where(UserSession.id == session_id)) is None


def test_get_me_touch_sliding_expiration_throttle(client: TestClient, db_session: Session) -> None:
    reg_res = client.post(
        "/api/auth/register",
        json={"email": "throttle_touch@linkvault.io", "password": "valid_secure_password_123"},
    )
    assert reg_res.status_code == 201

    raw_token = reg_res.cookies["linkvault_session"]
    token_hash = hash_session_token(raw_token)

    session_in_db = db_session.scalar(
        select(UserSession).where(UserSession.token_hash == token_hash)
    )
    assert session_in_db is not None
    original_last_seen = session_in_db.last_seen_at
    original_idle = session_in_db.idle_expires_at

    # 1. Chamada imediata (< 5 minutos): não deve atualizar last_seen_at
    res1 = client.get("/api/auth/me")
    assert res1.status_code == 200

    db_session.refresh(session_in_db)
    assert session_in_db.last_seen_at == original_last_seen
    assert session_in_db.idle_expires_at == original_idle

    # 2. Forçar last_seen_at para 10 minutos no passado (>= 5 min)
    session_in_db.last_seen_at = datetime.now(UTC) - timedelta(minutes=10)
    db_session.flush()

    res2 = client.get("/api/auth/me")
    assert res2.status_code == 200

    db_session.refresh(session_in_db)
    assert session_in_db.last_seen_at > original_last_seen


def test_logout_revokes_session_clears_cookie_and_is_idempotent(
    client: TestClient, db_session: Session
) -> None:
    # 1. Cadastro e login ativo
    reg_res = client.post(
        "/api/auth/register",
        json={"email": "logout_test@linkvault.io", "password": "valid_secure_password_123"},
    )
    assert reg_res.status_code == 201
    raw_token = reg_res.cookies["linkvault_session"]
    token_hash = hash_session_token(raw_token)

    # 2. Logout
    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 204
    assert logout_res.text == ""

    # Cookie deve ser limpo
    set_cookie_header = logout_res.headers.get("set-cookie", "")
    assert "linkvault_session=" in set_cookie_header

    # Sessão revogada no banco
    assert (
        db_session.scalar(select(UserSession).where(UserSession.token_hash == token_hash)) is None
    )

    # Nova tentativa de acessar rota protegida com o token revogado
    me_res = client.get("/api/auth/me")
    assert me_res.status_code == 401

    # 3. Idempotência: novo logout sem cookie ou sessão deve retornar 204
    client.cookies.clear()
    logout_again = client.post("/api/auth/logout")
    assert logout_again.status_code == 204


def test_get_me_expired_demo_user_is_deleted_and_returns_401(
    client: TestClient, db_session: Session
) -> None:
    past_date = datetime.now(UTC) - timedelta(minutes=10)
    future_date = datetime.now(UTC) + timedelta(days=7)

    demo_user = User(
        email="expired_demo@linkvault.io",
        password_hash=hash_password("pw1234567890"),
        is_demo=True,
        expires_at=past_date,
    )
    db_session.add(demo_user)
    db_session.flush()

    raw_token = "raw_demo_expired_token_12345"
    token_hash = hash_session_token(raw_token)

    demo_session = UserSession(
        user_id=demo_user.id,
        token_hash=token_hash,
        csrf_token="csrf_demo",
        idle_expires_at=future_date,
        absolute_expires_at=future_date,
    )
    db_session.add(demo_session)
    db_session.flush()

    client.cookies.set("linkvault_session", raw_token)
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Sessão inválida ou expirada."

    # Verifica exclusão do usuário e cascata
    assert db_session.scalar(select(User).where(User.id == demo_user.id)) is None
    assert db_session.scalar(select(UserSession).where(UserSession.id == demo_session.id)) is None
