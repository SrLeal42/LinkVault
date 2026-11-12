import hashlib
from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from app.auth.models import User, UserSession
from app.auth.service import cleanup_expired_demo_users
from app.core.config import Settings
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


def test_create_demo_user_success_sets_cookie_and_returns_payload(
    client: TestClient,
    db_session: Session,
) -> None:
    response = client.post("/api/auth/demo")
    assert response.status_code == 201

    data = response.json()
    assert data["user"]["is_demo"] is True
    assert data["user"]["expires_at"] is not None
    assert data["user"]["name"] == "Visitante Demo"
    assert data["user"]["email"].startswith("demo-")
    assert data["user"]["email"].endswith("@demo.linkvault.local")
    assert "csrf_token" in data
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]

    assert "linkvault_session" in response.cookies
    raw_token = response.cookies["linkvault_session"]
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    user_in_db = db_session.scalar(select(User).where(User.email == data["user"]["email"]))
    assert user_in_db is not None
    assert user_in_db.is_demo is True
    assert user_in_db.password_hash.startswith("$argon2id$")

    session_in_db = db_session.scalar(
        select(UserSession).where(UserSession.token_hash == token_hash)
    )
    assert session_in_db is not None
    assert session_in_db.user_id == user_in_db.id
    assert session_in_db.csrf_token == data["csrf_token"]


def test_create_demo_user_isolation_between_consecutive_clicks(client: TestClient) -> None:
    res1 = client.post("/api/auth/demo")
    assert res1.status_code == 201
    data1 = res1.json()

    res2 = client.post("/api/auth/demo")
    assert res2.status_code == 201
    data2 = res2.json()

    assert data1["user"]["id"] != data2["user"]["id"]
    assert data1["user"]["email"] != data2["user"]["email"]
    assert data1["csrf_token"] != data2["csrf_token"]
    assert res1.cookies["linkvault_session"] != res2.cookies["linkvault_session"]


def test_create_demo_user_disabled_when_demo_mode_false(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config import get_settings

    def mock_settings() -> Settings:
        original = get_settings()
        return original.model_copy(update={"demo_mode": False})

    monkeypatch.setattr("app.auth.service.get_settings", mock_settings)
    response = client.post("/api/auth/demo")
    assert response.status_code == 403
    assert response.headers["content-type"] == "application/problem+json"
    assert "desativado" in response.json()["detail"]


def test_create_demo_user_rate_limit_blocks_after_10_attempts(client: TestClient) -> None:
    fixed_ip = "198.51.100.77"

    for _ in range(10):
        res = client.post("/api/auth/demo", headers={"X-Forwarded-For": fixed_ip})
        assert res.status_code == 201

    res_blocked = client.post("/api/auth/demo", headers={"X-Forwarded-For": fixed_ip})
    assert res_blocked.status_code == 429
    assert "Retry-After" in res_blocked.headers
    assert res_blocked.json()["type"] == "urn:linkvault:error:rate_limit_exceeded"


def test_cleanup_expired_demo_users_purges_only_expired_demos_and_cascades_sessions(
    db_session: Session,
) -> None:
    now = datetime.now(UTC)

    # 1. Usuário regular não demo (nunca deve ser excluído)
    regular_user = User(
        email="regular@linkvault.io",
        password_hash=hash_password("password_regular_123"),
        is_demo=False,
        expires_at=None,
    )
    # 2. Usuário demo ativo
    active_demo = User(
        email="demo-active@demo.linkvault.local",
        password_hash=hash_password("dummy_password_hash"),
        is_demo=True,
        expires_at=now + timedelta(hours=12),
    )
    # 3. Usuário demo expirado
    expired_demo = User(
        email="demo-expired@demo.linkvault.local",
        password_hash=hash_password("dummy_password_hash"),
        is_demo=True,
        expires_at=now - timedelta(minutes=5),
    )
    db_session.add_all([regular_user, active_demo, expired_demo])
    db_session.flush()

    # Sessão para o demo expirado
    expired_session = UserSession(
        user_id=expired_demo.id,
        token_hash=hash_session_token("expired_demo_session_raw"),
        csrf_token="csrf_expired",
        idle_expires_at=now + timedelta(days=1),
        absolute_expires_at=now + timedelta(days=1),
    )
    db_session.add(expired_session)
    db_session.flush()
    expired_session_id = expired_session.id

    # Executa a limpeza
    deleted_count = cleanup_expired_demo_users(db_session, now=now)
    assert deleted_count >= 1

    # Verificações de integridade
    assert db_session.scalar(select(User).where(User.id == regular_user.id)) is not None
    assert db_session.scalar(select(User).where(User.id == active_demo.id)) is not None
    assert db_session.scalar(select(User).where(User.id == expired_demo.id)) is None
    assert (
        db_session.scalar(select(UserSession).where(UserSession.id == expired_session_id)) is None
    )


def test_create_demo_user_opportunistic_cleanup(client: TestClient, db_session: Session) -> None:
    past_date = datetime.now(UTC) - timedelta(hours=1)
    old_demo = User(
        email="old_demo_opportunistic@demo.linkvault.local",
        password_hash=hash_password("dummy_hash"),
        is_demo=True,
        expires_at=past_date,
    )
    db_session.add(old_demo)
    db_session.commit()

    old_demo_id = old_demo.id

    # POST /api/auth/demo deve disparar cleanup_expired_demo_users
    response = client.post("/api/auth/demo")
    assert response.status_code == 201

    assert db_session.scalar(select(User).where(User.id == old_demo_id)) is None


def test_create_demo_user_origin_csrf_validation(client: TestClient) -> None:
    # Sem cabeçalho Origin ou Referer
    res_no_origin = client.post("/api/auth/demo", headers={"Origin": ""})
    assert res_no_origin.status_code == 403
    assert res_no_origin.json()["type"] == "urn:linkvault:error:csrf_failed"

    # Origem não permitida
    res_untrusted = client.post("/api/auth/demo", headers={"Origin": "https://malicious.com"})
    assert res_untrusted.status_code == 403
