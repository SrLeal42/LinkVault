import hashlib
from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from app.auth.models import User, UserSession
from app.core.db import get_db
from app.core.security import _build_hasher, hash_password, hash_session_token
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


def test_register_success_creates_user_and_sets_cookie(
    client: TestClient, db_session: Session
) -> None:
    payload = {
        "email": "  NewUser@LinkVault.IO  ",
        "password": "valid_secure_password_123",
        "name": "  Tester Name  ",
    }

    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["user"]["email"] == "newuser@linkvault.io"
    assert data["user"]["name"] == "Tester Name"
    assert data["user"]["is_demo"] is False
    assert "csrf_token" in data
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]

    assert "linkvault_session" in response.cookies
    raw_cookie_token = response.cookies["linkvault_session"]
    token_hash = hashlib.sha256(raw_cookie_token.encode("utf-8")).hexdigest()

    user_in_db = db_session.scalar(select(User).where(User.email == "newuser@linkvault.io"))
    assert user_in_db is not None
    assert user_in_db.password_hash.startswith("$argon2id$")

    session_in_db = db_session.scalar(
        select(UserSession).where(UserSession.token_hash == token_hash)
    )
    assert session_in_db is not None
    assert session_in_db.user_id == user_in_db.id
    assert session_in_db.csrf_token == data["csrf_token"]


def test_register_duplicate_email_case_insensitive_returns_409(
    client: TestClient, db_session: Session
) -> None:
    payload1 = {
        "email": "duplicate@linkvault.io",
        "password": "valid_secure_password_123",
    }
    res1 = client.post("/api/auth/register", json=payload1)
    assert res1.status_code == 201

    payload2 = {
        "email": "DUPLICATE@LINKVAULT.IO",
        "password": "another_secure_password_123",
    }
    res2 = client.post("/api/auth/register", json=payload2)
    assert res2.status_code == 409
    assert res2.headers["content-type"] == "application/problem+json"

    data = res2.json()
    assert data["status"] == 409
    assert data["title"] == "Conflito de dados"
    assert data["type"] == "urn:linkvault:error:conflict"


def test_register_password_policy_violation_returns_422(
    client: TestClient, db_session: Session
) -> None:

    # Senha curta (< 12)
    res_short = client.post(
        "/api/auth/register",
        json={"email": "short@linkvault.io", "password": "short"},
    )
    assert res_short.status_code == 422
    assert any(err["field"] == "password" for err in res_short.json()["errors"])

    # Senha comum
    res_common = client.post(
        "/api/auth/register",
        json={"email": "common@linkvault.io", "password": "password123456"},
    )
    assert res_common.status_code == 422
    assert any("comum" in err["message"] for err in res_common.json()["errors"])

    # Senha idêntica ao e-mail
    res_same = client.post(
        "/api/auth/register",
        json={"email": "sameemail@linkvault.io", "password": "sameemail@linkvault.io"},
    )
    assert res_same.status_code == 422
    assert any("idêntica" in err["message"] for err in res_same.json()["errors"])


def test_login_success_rotates_session_and_sets_cookie(
    client: TestClient, db_session: Session
) -> None:
    email = "login_success@linkvault.io"
    password = "valid_secure_password_123"

    reg_res = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201
    old_cookie = reg_res.cookies["linkvault_session"]

    login_res = client.post("/api/auth/login", json={"email": email.upper(), "password": password})
    assert login_res.status_code == 200

    data = login_res.json()
    assert data["user"]["email"] == email
    assert "csrf_token" in data

    new_cookie = login_res.cookies["linkvault_session"]
    assert new_cookie != old_cookie


def test_login_invalid_credentials_returns_generic_401(
    client: TestClient, db_session: Session
) -> None:
    email = "existing_user@linkvault.io"
    password = "valid_secure_password_123"

    reg_res = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201

    # Senha errada
    res_wrong_pw = client.post(
        "/api/auth/login",
        json={"email": email, "password": "wrong_password_123"},
    )
    assert res_wrong_pw.status_code == 401
    assert res_wrong_pw.headers["content-type"] == "application/problem+json"
    assert res_wrong_pw.json()["detail"] == "E-mail ou senha inválidos."

    # E-mail inexistente (tempo constante com dummy hash)
    res_no_user = client.post(
        "/api/auth/login",
        json={"email": "non_existent_email@linkvault.io", "password": "some_password_123"},
    )
    assert res_no_user.status_code == 401
    assert res_no_user.json()["detail"] == "E-mail ou senha inválidos."


def test_login_transparent_rehash_on_parameter_change(
    client: TestClient, db_session: Session
) -> None:
    email = "rehash_user@linkvault.io"
    password = "valid_secure_password_123"

    # Cria hash com parâmetros antigos (t=1, m=8192, p=1)
    legacy_hasher = _build_hasher(time_cost=1, memory_cost=8192, parallelism=1)
    legacy_hash = legacy_hasher.hash(password)

    user = User(email=email, password_hash=legacy_hash)
    db_session.add(user)
    db_session.flush()

    assert "$m=8192,t=1,p=1$" in user.password_hash

    # Login com parâmetros padrão atuais (t=2, m=19456, p=1)
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200

    db_session.refresh(user)
    assert "$m=19456,t=2,p=1$" in user.password_hash


def test_login_opportunistic_cleanup_of_expired_sessions(
    client: TestClient, db_session: Session
) -> None:
    email = "cleanup_user@linkvault.io"
    password = "valid_secure_password_123"

    user = User(email=email, password_hash=hash_password(password))
    db_session.add(user)
    db_session.flush()

    past_date = datetime.now(UTC) - timedelta(hours=2)
    future_date = datetime.now(UTC) + timedelta(days=7)

    # Hashes SHA-256 com exatamente 64 caracteres hexadecimais
    expired_hash = hash_session_token("expired_session_token_seed")
    active_hash = hash_session_token("active_session_token_seed")

    expired_session = UserSession(
        user_id=user.id,
        token_hash=expired_hash,
        csrf_token="csrf_1",
        idle_expires_at=past_date,
        absolute_expires_at=future_date,
    )
    active_session = UserSession(
        user_id=user.id,
        token_hash=active_hash,
        csrf_token="csrf_2",
        idle_expires_at=future_date,
        absolute_expires_at=future_date,
    )
    db_session.add_all([expired_session, active_session])
    db_session.flush()

    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200

    sessions = db_session.scalars(select(UserSession).where(UserSession.user_id == user.id)).all()
    assert len(sessions) == 2
    hashes = {s.token_hash for s in sessions}
    assert expired_session.token_hash not in hashes
    assert active_session.token_hash in hashes
