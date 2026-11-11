import math
import secrets
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import CursorResult, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import AuthAttempt, AuthAttemptScope, User, UserSession
from app.auth.schemas import LoginRequest, RegisterRequest
from app.core.config import Settings, get_settings
from app.core.errors import (
    ConflictError,
    CSRFError,
    RateLimitExceededError,
    UnauthorizedError,
    UnprocessableContentError,
)
from app.core.security import (
    check_needs_rehash,
    generate_csrf_token,
    generate_session_token,
    hash_password,
    hash_rate_limit_key,
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


def cleanup_expired_auth_attempts(
    db: Session,
    *,
    now: datetime | None = None,
    settings: Settings | None = None,
) -> int:
    cfg = settings or get_settings()
    current_time = now or datetime.now(UTC)
    cutoff = current_time - timedelta(seconds=cfg.rate_limit_retention_seconds)
    stmt = delete(AuthAttempt).where(AuthAttempt.created_at <= cutoff)
    result = db.execute(stmt)
    if isinstance(result, CursorResult):
        return int(result.rowcount)
    return 0


def check_rate_limit(
    db: Session,
    *,
    scope: AuthAttemptScope,
    key_hash: str,
    max_attempts: int,
    window_seconds: int,
    only_failures: bool,
    now: datetime | None = None,
) -> None:
    current_time = now or datetime.now(UTC)
    window_start = current_time - timedelta(seconds=window_seconds)

    stmt = select(
        func.count(AuthAttempt.id),
        func.min(AuthAttempt.created_at),
    ).where(
        AuthAttempt.scope == scope,
        AuthAttempt.key_hash == key_hash,
        AuthAttempt.created_at > window_start,
    )
    if only_failures:
        stmt = stmt.where(AuthAttempt.succeeded.is_(False))

    row = db.execute(stmt).one()
    attempt_count: int = int(row[0] or 0)
    oldest_attempt_at: datetime | None = row[1]

    if attempt_count >= max_attempts and oldest_attempt_at is not None:
        unlock_at = oldest_attempt_at + timedelta(seconds=window_seconds)
        remaining_seconds = (unlock_at - current_time).total_seconds()
        retry_after = max(1, math.ceil(remaining_seconds))
        raise RateLimitExceededError(retry_after=retry_after)


def record_auth_attempts(
    db: Session,
    *,
    scope: AuthAttemptScope,
    key_hashes: Sequence[str],
    succeeded: bool,
    now: datetime | None = None,
) -> None:
    current_time = now or datetime.now(UTC)
    for kh in key_hashes:
        db.add(
            AuthAttempt(
                scope=scope,
                key_hash=kh,
                succeeded=succeeded,
                created_at=current_time,
            )
        )


def enforce_demo_rate_limit(
    db: Session,
    *,
    client_ip: str,
    now: datetime | None = None,
    settings: Settings | None = None,
) -> str:
    cfg = settings or get_settings()
    current_time = now or datetime.now(UTC)
    cleanup_expired_auth_attempts(db, now=current_time, settings=cfg)
    ip_hash = hash_rate_limit_key("ip", client_ip)
    try:
        check_rate_limit(
            db,
            scope=AuthAttemptScope.DEMO,
            key_hash=ip_hash,
            max_attempts=cfg.rate_limit_demo_ip_max_attempts,
            window_seconds=cfg.rate_limit_demo_window_seconds,
            only_failures=False,
            now=current_time,
        )
    except RateLimitExceededError:
        db.commit()
        raise
    return ip_hash


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
    client_ip: str = "unknown",
    user_agent: str | None = None,
    settings: Settings | None = None,
) -> AuthSessionResult:
    cfg = settings or get_settings()
    now = datetime.now(UTC)
    normalized_email = normalize_email(payload.email)
    ip_hash = hash_rate_limit_key("ip", client_ip)

    cleanup_expired_auth_attempts(db, now=now, settings=cfg)

    try:
        check_rate_limit(
            db,
            scope=AuthAttemptScope.REGISTER,
            key_hash=ip_hash,
            max_attempts=cfg.rate_limit_register_ip_max_attempts,
            window_seconds=cfg.rate_limit_register_window_seconds,
            only_failures=False,
            now=now,
        )
    except RateLimitExceededError:
        db.commit()
        raise

    try:
        validate_password_policy(payload.password, email=normalized_email, settings=cfg)
    except UnprocessableContentError:
        record_auth_attempts(
            db,
            scope=AuthAttemptScope.REGISTER,
            key_hashes=(ip_hash,),
            succeeded=False,
            now=now,
        )
        db.commit()
        raise

    existing_user = db.scalar(select(User).where(func.lower(User.email) == normalized_email))
    if existing_user is not None:
        record_auth_attempts(
            db,
            scope=AuthAttemptScope.REGISTER,
            key_hashes=(ip_hash,),
            succeeded=False,
            now=now,
        )
        db.commit()
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
        record_auth_attempts(
            db,
            scope=AuthAttemptScope.REGISTER,
            key_hashes=(ip_hash,),
            succeeded=False,
            now=now,
        )
        db.commit()
        raise ConflictError(detail="Este endereço de e-mail já está cadastrado.") from err

    record_auth_attempts(
        db,
        scope=AuthAttemptScope.REGISTER,
        key_hashes=(ip_hash,),
        succeeded=True,
        now=now,
    )

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
    client_ip: str = "unknown",
    user_agent: str | None = None,
    settings: Settings | None = None,
) -> AuthSessionResult:
    cfg = settings or get_settings()
    normalized_email = normalize_email(payload.email)
    now = datetime.now(UTC)

    ip_hash = hash_rate_limit_key("ip", client_ip)
    email_hash = hash_rate_limit_key("email", normalized_email)

    cleanup_expired_auth_attempts(db, now=now, settings=cfg)

    try:
        check_rate_limit(
            db,
            scope=AuthAttemptScope.LOGIN,
            key_hash=ip_hash,
            max_attempts=cfg.rate_limit_login_ip_max_attempts,
            window_seconds=cfg.rate_limit_login_window_seconds,
            only_failures=True,
            now=now,
        )
        check_rate_limit(
            db,
            scope=AuthAttemptScope.LOGIN,
            key_hash=email_hash,
            max_attempts=cfg.rate_limit_login_email_max_attempts,
            window_seconds=cfg.rate_limit_login_window_seconds,
            only_failures=True,
            now=now,
        )
    except RateLimitExceededError:
        db.commit()
        raise

    user = db.scalar(select(User).where(func.lower(User.email) == normalized_email))

    if user is None:
        verify_dummy_password(payload.password, cfg)
        record_auth_attempts(
            db,
            scope=AuthAttemptScope.LOGIN,
            key_hashes=(ip_hash, email_hash),
            succeeded=False,
            now=now,
        )
        db.commit()
        raise UnauthorizedError(detail=GENERIC_LOGIN_ERROR)

    if user.is_demo and user.expires_at is not None and user.expires_at <= now:
        verify_dummy_password(payload.password, cfg)
        record_auth_attempts(
            db,
            scope=AuthAttemptScope.LOGIN,
            key_hashes=(ip_hash, email_hash),
            succeeded=False,
            now=now,
        )
        db.commit()
        raise UnauthorizedError(detail=GENERIC_LOGIN_ERROR)

    if not verify_password(user.password_hash, payload.password, cfg):
        record_auth_attempts(
            db,
            scope=AuthAttemptScope.LOGIN,
            key_hashes=(ip_hash, email_hash),
            succeeded=False,
            now=now,
        )
        db.commit()
        raise UnauthorizedError(detail=GENERIC_LOGIN_ERROR)

    if check_needs_rehash(user.password_hash, cfg):
        user.password_hash = hash_password(payload.password, cfg)
        user.updated_at = now

    cleanup_expired_sessions(db, user_id=user.id)

    record_auth_attempts(
        db,
        scope=AuthAttemptScope.LOGIN,
        key_hashes=(ip_hash, email_hash),
        succeeded=True,
        now=now,
    )

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


def revoke_session_by_token(
    db: Session,
    raw_token: str | None,
    *,
    csrf_token_header: str | None = None,
) -> None:
    if not raw_token:
        return

    now = datetime.now(UTC)
    token_hash = hash_session_token(raw_token)
    user_session = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash))

    if user_session is None:
        return

    if now >= user_session.idle_expires_at or now >= user_session.absolute_expires_at:
        db.delete(user_session)
        db.commit()
        return

    if not csrf_token_header or not secrets.compare_digest(
        csrf_token_header, user_session.csrf_token
    ):
        raise CSRFError(detail="Token CSRF ausente ou inválido.")

    db.delete(user_session)
    db.commit()
