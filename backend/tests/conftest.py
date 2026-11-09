from collections.abc import Generator

import pytest
from app.core.config import get_settings
from app.core.db import engine
from sqlalchemy.orm import Session

DEFAULT_TEST_ORIGIN: str = get_settings().allowed_origins[0]


@pytest.fixture
def auth_client_headers() -> dict[str, str]:
    """Headers padrão para chamadas do TestClient em testes de rotas mutáveis."""
    return {"Origin": DEFAULT_TEST_ORIGIN}


@pytest.fixture
def db_session() -> Generator[Session]:
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        autoflush=False,
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
