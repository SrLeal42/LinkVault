from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest

from app.auth.models import AuthAttempt, AuthAttemptScope, User
from app.auth.service import cleanup_expired_auth_attempts, enforce_demo_rate_limit
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.errors import RateLimitExceededError
from app.core.security import hash_rate_limit_key
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


def test_login_rate_limit_by_email_blocks_after_5_failures(
    client: TestClient,
    db_session: Session,
) -> None:
    email = "email_limit@linkvault.io"
    password = "valid_secure_password_123"

    reg_res = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201

    # 5 tentativas com senha errada usando IPs diferentes (evita estourar o limite de IP)
    for i in range(1, 6):
        res = client.post(
            "/api/auth/login",
            json={"email": email, "password": "wrong_password"},
            headers={"X-Forwarded-For": f"198.51.100.{i}"},
        )
        assert res.status_code == 401
        assert res.json()["detail"] == "E-mail ou senha inválidos."

    # A 6ª tentativa para o mesmo e-mail deve ser bloqueada com 429
    res_blocked = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
        headers={"X-Forwarded-For": "198.51.100.99"},
    )
    assert res_blocked.status_code == 429
    assert res_blocked.headers["content-type"] == "application/problem+json"
    assert "Retry-After" in res_blocked.headers
    retry_after = int(res_blocked.headers["Retry-After"])
    assert 0 < retry_after <= 900
    assert res_blocked.json()["type"] == "urn:linkvault:error:rate_limit_exceeded"

    # Outro e-mail deve conseguir logar pelo mesmo IP 99
    other_email = "other_user@linkvault.io"
    client.post("/api/auth/register", json={"email": other_email, "password": password})
    res_other = client.post(
        "/api/auth/login",
        json={"email": other_email, "password": password},
        headers={"X-Forwarded-For": "198.51.100.99"},
    )
    assert res_other.status_code == 200


def test_login_rate_limit_by_ip_blocks_after_20_failures(client: TestClient) -> None:
    fixed_ip = "203.0.113.10"

    for i in range(20):
        res = client.post(
            "/api/auth/login",
            json={"email": f"victim_{i}@linkvault.io", "password": "wrong_password"},
            headers={"X-Forwarded-For": fixed_ip},
        )
        assert res.status_code == 401

    # A 21ª tentativa a partir do mesmo IP deve retornar 429 mesmo para um novo e-mail
    res_blocked = client.post(
        "/api/auth/login",
        json={"email": "brand_new_victim@linkvault.io", "password": "wrong_password"},
        headers={"X-Forwarded-For": fixed_ip},
    )
    assert res_blocked.status_code == 429
    assert "Retry-After" in res_blocked.headers


def test_login_success_does_not_reset_previous_failures(client: TestClient) -> None:
    email = "sliding_window@linkvault.io"
    password = "valid_secure_password_123"

    reg_res = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201

    # 4 falhas
    for i in range(1, 5):
        res = client.post(
            "/api/auth/login",
            json={"email": email, "password": "wrong_password"},
            headers={"X-Forwarded-For": f"192.0.2.{i}"},
        )
        assert res.status_code == 401

    # 1 sucesso intercalado
    res_ok = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
        headers={"X-Forwarded-For": "192.0.2.100"},
    )
    assert res_ok.status_code == 200

    # Mais 1 falha (totalizando 5 falhas na janela)
    res_fail = client.post(
        "/api/auth/login",
        json={"email": email, "password": "wrong_password"},
        headers={"X-Forwarded-For": "192.0.2.101"},
    )
    assert res_fail.status_code == 401

    # 6ª tentativa bloqueada por atingir o limite de 5 falhas
    res_blocked = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
        headers={"X-Forwarded-For": "192.0.2.102"},
    )
    assert res_blocked.status_code == 429


def test_register_rate_limit_counts_failures_and_successes(client: TestClient) -> None:
    fixed_ip = "198.51.100.42"

    # Tentativa 1: Sucesso (201)
    res1 = client.post(
        "/api/auth/register",
        json={"email": "reg1@linkvault.io", "password": "valid_secure_password_123"},
        headers={"X-Forwarded-For": fixed_ip},
    )
    assert res1.status_code == 201

    # Tentativa 2: Falha por política de senha comum (422 validado no service)
    res2 = client.post(
        "/api/auth/register",
        json={"email": "reg2@linkvault.io", "password": "password123456"},
        headers={"X-Forwarded-For": fixed_ip},
    )
    assert res2.status_code == 422

    # Tentativa 3: Falha por e-mail duplicado (409)
    res3 = client.post(
        "/api/auth/register",
        json={"email": "reg1@linkvault.io", "password": "valid_secure_password_123"},
        headers={"X-Forwarded-For": fixed_ip},
    )
    assert res3.status_code == 409

    # Tentativa 4: Sucesso (201)
    res4 = client.post(
        "/api/auth/register",
        json={"email": "reg4@linkvault.io", "password": "valid_secure_password_123"},
        headers={"X-Forwarded-For": fixed_ip},
    )
    assert res4.status_code == 201

    # Tentativa 5: Sucesso (201)
    res5 = client.post(
        "/api/auth/register",
        json={"email": "reg5@linkvault.io", "password": "valid_secure_password_123"},
        headers={"X-Forwarded-For": fixed_ip},
    )
    assert res5.status_code == 201

    # Tentativa 6: Bloqueada pelo limite de 5 por IP por hora
    res_blocked = client.post(
        "/api/auth/register",
        json={"email": "reg6@linkvault.io", "password": "valid_secure_password_123"},
        headers={"X-Forwarded-For": fixed_ip},
    )
    assert res_blocked.status_code == 429
    assert int(res_blocked.headers["Retry-After"]) > 0


def test_trusted_proxy_ip_extraction(client: TestClient) -> None:
    # trusted_proxy_count = 1: deve ler o último IP do XFF (adicionado pelo proxy)
    res = client.post(
        "/api/auth/login",
        json={"email": "spoof@linkvault.io", "password": "wrong"},
        headers={"X-Forwarded-For": "1.1.1.1, 203.0.113.88"},
    )
    assert res.status_code == 401

    # IP malformado no XFF deve fazer fallback silencioso para o cliente sem estourar 500
    res_malformed = client.post(
        "/api/auth/login",
        json={"email": "spoof2@linkvault.io", "password": "wrong"},
        headers={"X-Forwarded-For": "invalid-ip-format"},
    )
    assert res_malformed.status_code == 401


def test_cleanup_expired_auth_attempts(db_session: Session) -> None:
    now = datetime.now(UTC)
    old_time = now - timedelta(hours=25)

    old_attempt = AuthAttempt(
        scope=AuthAttemptScope.LOGIN,
        key_hash="a" * 64,
        succeeded=False,
        created_at=old_time,
    )
    recent_attempt = AuthAttempt(
        scope=AuthAttemptScope.LOGIN,
        key_hash="b" * 64,
        succeeded=False,
        created_at=now,
    )
    db_session.add_all([old_attempt, recent_attempt])
    db_session.flush()

    deleted_count = cleanup_expired_auth_attempts(db_session, now=now)
    assert deleted_count >= 1

    remaining = db_session.scalars(select(AuthAttempt)).all()
    remaining_hashes = {a.key_hash for a in remaining}
    assert "a" * 64 not in remaining_hashes
    assert "b" * 64 in remaining_hashes


def test_enforce_demo_rate_limit(db_session: Session) -> None:
    ip = "192.0.2.55"
    settings = Settings(
        rate_limit_demo_ip_max_attempts=2,
        rate_limit_demo_window_seconds=60,
    )

    # Executa 2 tentativas de demo com sucesso
    ip_hash = enforce_demo_rate_limit(db_session, client_ip=ip, settings=settings)
    db_session.add(
        AuthAttempt(
            scope=AuthAttemptScope.DEMO,
            key_hash=ip_hash,
            succeeded=True,
        )
    )
    db_session.add(
        AuthAttempt(
            scope=AuthAttemptScope.DEMO,
            key_hash=ip_hash,
            succeeded=True,
        )
    )
    db_session.flush()

    # 3ª chamada deve levantar RateLimitExceededError
    with pytest.raises(RateLimitExceededError) as exc_info:
        enforce_demo_rate_limit(db_session, client_ip=ip, settings=settings)
    assert exc_info.value.status_code == 429
