import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import CursorResult, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import User, UserSession
from app.auth.schemas import LoginRequest, RegisterRequest
from app.core.config import Settings, get_settings
from app.core.errors import ConflictError, UnauthorizedError
from app.core.security import (
    check_needs_rehash,
    generate_csrf_token,
    generate_session_token,
    hash_password,
    hash_session_token,
    normalize_email,
    validate_password_policy,
    verify_dummy_password,
    verify_password,
)

GENERIC_LOGIN_ERROR: str = "E-mail ou senha inválidos."


@dataclass(frozen=True, slots=True)
class AuthSessionResult:
    user: User
    session: UserSession
    raw_session_token: str
    csrf_token: str


def cleanup_expired_sessions(db: Session, *, user_id: uuid.UUID | None = None) -> int:
    now = datetime.now(UTC)
    stmt = delete(UserSession).where(
        (UserSession.idle_expires_at <= now) | (UserSession.absolute_expires_at <= now)
    )
    if user_id is not None:
        stmt = stmt.where(UserSession.user_id == user_id)
    result = db.execute(stmt)
    if isinstance(result, CursorResult):
        return int(result.rowcount)
    return 0


def create_user_session(
    db: Session,
    *,
    user: User,
    user_agent: str | None = None,
    settings: Settings | None = None,
) -> tuple[UserSession, str, str]:
    cfg = settings or get_settings()
    now = datetime.now(UTC)

    raw_token = generate_session_token()
    token_hash = hash_session_token(raw_token)
    csrf_token = generate_csrf_token()

    idle_expires_at = now + timedelta(seconds=cfg.session_idle_ttl_seconds)
    absolute_expires_at = now + timedelta(seconds=cfg.session_absolute_ttl_seconds)

    user_session = UserSession(
        user_id=user.id,
        token_hash=token_hash,
        csrf_token=csrf_token,
        created_at=now,
        last_seen_at=now,
        idle_expires_at=idle_expires_at,
        absolute_expires_at=absolute_expires_at,
        user_agent=user_agent[:512] if user_agent else None,
    )
    db.add(user_session)
    db.flush()
    return user_session, raw_token, csrf_token


def register_user(
    db: Session,
    payload: RegisterRequest,
    *,
    user_agent: str | None = None,
    settings: Settings | None = None,
) -> AuthSessionResult:
    cfg = settings or get_settings()
    normalized_email = normalize_email(payload.email)

    validate_password_policy(payload.password, email=normalized_email, settings=cfg)

    existing_user = db.scalar(select(User).where(func.lower(User.email) == normalized_email))
    if existing_user is not None:
        raise ConflictError(detail="Este endereço de e-mail já está cadastrado.")

    user = User(
        email=normalized_email,
        password_hash=hash_password(payload.password, cfg),
        name=payload.name,
    )
    db.add(user)

    try:
        db.flush()
    except IntegrityError as err:
        db.rollback()
        raise ConflictError(detail="Este endereço de e-mail já está cadastrado.") from err

    user_session, raw_token, csrf_token = create_user_session(
        db,
        user=user,
        user_agent=user_agent,
        settings=cfg,
    )
    db.commit()

    return AuthSessionResult(
        user=user,
        session=user_session,
        raw_session_token=raw_token,
        csrf_token=csrf_token,
    )


def authenticate_user(
    db: Session,
    payload: LoginRequest,
    *,
    user_agent: str | None = None,
    settings: Settings | None = None,
) -> AuthSessionResult:
    cfg = settings or get_settings()
    normalized_email = normalize_email(payload.email)
    now = datetime.now(UTC)

    user = db.scalar(select(User).where(func.lower(User.email) == normalized_email))

    if user is None:
        verify_dummy_password(payload.password, cfg)
        raise UnauthorizedError(detail=GENERIC_LOGIN_ERROR)

    if user.is_demo and user.expires_at is not None and user.expires_at <= now:
        verify_dummy_password(payload.password, cfg)
        raise UnauthorizedError(detail=GENERIC_LOGIN_ERROR)

    if not verify_password(user.password_hash, payload.password, cfg):
        raise UnauthorizedError(detail=GENERIC_LOGIN_ERROR)

    if check_needs_rehash(user.password_hash, cfg):
        user.password_hash = hash_password(payload.password, cfg)
        user.updated_at = now

    cleanup_expired_sessions(db, user_id=user.id)

    user_session, raw_token, csrf_token = create_user_session(
        db,
        user=user,
        user_agent=user_agent,
        settings=cfg,
    )
    db.commit()

    return AuthSessionResult(
        user=user,
        session=user_session,
        raw_session_token=raw_token,
        csrf_token=csrf_token,
    )


@dataclass(frozen=True, slots=True)
class AuthenticatedSession:
    user: User
    session: UserSession


def resolve_authenticated_session(
    db: Session,
    raw_token: str | None,
    *,
    settings: Settings | None = None,
) -> AuthenticatedSession:
    if not raw_token:
        raise UnauthorizedError()

    cfg = settings or get_settings()
    now = datetime.now(UTC)
    token_hash = hash_session_token(raw_token)
    stmt = (
        select(UserSession)
        .join(User, UserSession.user_id == User.id)
        .where(UserSession.token_hash == token_hash)
    )

    user_session = db.scalar(stmt)
    if user_session is None:
        raise UnauthorizedError(detail="Sessão inválida ou expirada.")
    if now >= user_session.idle_expires_at or now >= user_session.absolute_expires_at:
        db.delete(user_session)
        db.commit()
        raise UnauthorizedError(detail="Sessão inválida ou expirada.")

    user = user_session.user
    if user.is_demo and user.expires_at is not None and now >= user.expires_at:
        db.delete(user)
        db.commit()
        raise UnauthorizedError(detail="Sessão inválida ou expirada.")
    elapsed_seconds = (now - user_session.last_seen_at).total_seconds()
    if elapsed_seconds >= cfg.session_touch_interval_seconds:
        user_session.last_seen_at = now
        candidate_idle = now + timedelta(seconds=cfg.session_idle_ttl_seconds)
        user_session.idle_expires_at = min(candidate_idle, user_session.absolute_expires_at)
        db.commit()
    return AuthenticatedSession(user=user, session=user_session)


def revoke_session_by_token(db: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    token_hash = hash_session_token(raw_token)
    db.execute(delete(UserSession).where(UserSession.token_hash == token_hash))
    db.commit()
