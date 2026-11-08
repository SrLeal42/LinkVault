import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.auth.models import AuthAttempt, AuthAttemptScope, User, UserSession
from sqlalchemy import delete, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


def test_user_creation_with_uuid7_and_defaults(db_session: Session) -> None:
    user = User(
        email="dev@linkvault.io",
        password_hash="argon2id$mockhash",
        name="Developer",
    )
    db_session.add(user)
    db_session.flush()

    assert user.id.version == 7
    assert user.is_demo is False
    assert user.expires_at is None
    assert user.created_at is not None
    assert user.updated_at is not None


def test_user_email_unique_case_insensitive(db_session: Session) -> None:
    user1 = User(
        email="TestUser@Domain.com",
        password_hash="hash1",
    )
    db_session.add(user1)
    db_session.flush()

    user2 = User(
        email="testuser@domain.com",
        password_hash="hash2",
    )
    db_session.add(user2)

    with pytest.raises(IntegrityError):
        db_session.flush()

    db_session.rollback()


def test_user_demo_consistency_constraint(db_session: Session) -> None:
    invalid_demo = User(
        email="demo-invalid@domain.com",
        password_hash="hash",
        is_demo=True,
        expires_at=None,
    )
    db_session.add(invalid_demo)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()

    invalid_regular = User(
        email="regular-invalid@domain.com",
        password_hash="hash",
        is_demo=False,
        expires_at=datetime.now(UTC),
    )
    db_session.add(invalid_regular)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()

    valid_demo = User(
        email="demo-valid@domain.com",
        password_hash="hash",
        is_demo=True,
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db_session.add(valid_demo)
    db_session.flush()
    assert valid_demo.id.version == 7


def test_session_token_hash_uniqueness(db_session: Session) -> None:
    user = User(email="session-owner@domain.com", password_hash="hash")
    db_session.add(user)
    db_session.flush()

    expires = datetime.now(UTC) + timedelta(days=7)
    session1 = UserSession(
        user_id=user.id,
        token_hash="a" * 64,
        csrf_token="csrf-token-1",
        idle_expires_at=expires,
        absolute_expires_at=expires,
    )
    db_session.add(session1)
    db_session.flush()

    session2 = UserSession(
        user_id=user.id,
        token_hash="a" * 64,
        csrf_token="csrf-token-2",
        idle_expires_at=expires,
        absolute_expires_at=expires,
    )
    db_session.add(session2)

    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_session_cascade_delete_on_user_removal(db_session: Session) -> None:
    user = User(email="cascade-target@domain.com", password_hash="hash")
    db_session.add(user)
    db_session.flush()

    expires = datetime.now(UTC) + timedelta(days=7)
    user_session = UserSession(
        user_id=user.id,
        token_hash="b" * 64,
        csrf_token="csrf-token",
        idle_expires_at=expires,
        absolute_expires_at=expires,
    )
    db_session.add(user_session)
    db_session.flush()

    session_id = user_session.id

    db_session.execute(delete(User).where(User.id == user.id))
    db_session.flush()

    result = db_session.scalar(select(UserSession).where(UserSession.id == session_id))
    assert result is None


def test_auth_attempt_scope_constraint(db_session: Session) -> None:
    valid_attempt = AuthAttempt(
        scope=AuthAttemptScope.LOGIN,
        key_hash="c" * 64,
        succeeded=True,
    )
    db_session.add(valid_attempt)
    db_session.flush()
    assert valid_attempt.id.version == 7

    invalid_stmt = insert(AuthAttempt).values(
        id=uuid.uuid7(),
        scope="unsupported_scope",
        key_hash="d" * 64,
        succeeded=False,
    )
    with pytest.raises(IntegrityError):
        db_session.execute(invalid_stmt)
    db_session.rollback()
