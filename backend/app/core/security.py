import hashlib
import re
import secrets
from functools import lru_cache

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Request, Response

from app.core.config import Settings, get_settings
from app.core.errors import UnprocessableContentError, ValidationErrorItem

SESSION_COOKIE_NAME_DEV: str = "linkvault_session"
SESSION_COOKIE_NAME_PROD: str = "__Host-linkvault_session"

_EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

COMMON_PASSWORDS: frozenset[str] = frozenset(
    {
        "123456789012",
        "1234567890123",
        "password1234",
        "password12345",
        "password123456",
        "qwerty123456",
        "admin1234567",
        "linkvault123",
        "linkvault1234",
        "iloveyou1234",
        "welcome12345",
        "monkey123456",
        "dragon123456",
        "master123456",
        "shadow123456",
        "sunshine1234",
        "princess1234",
        "football1234",
        "trustnoone12",
    }
)


@lru_cache(maxsize=8)
def _build_hasher(time_cost: int, memory_cost: int, parallelism: int) -> PasswordHasher:
    return PasswordHasher(
        time_cost=time_cost,
        memory_cost=memory_cost,
        parallelism=parallelism,
        hash_len=32,
        salt_len=16,
        type=Type.ID,
    )


def get_password_hasher(settings: Settings | None = None) -> PasswordHasher:
    cfg = settings or get_settings()
    return _build_hasher(cfg.argon2_time_cost, cfg.argon2_memory_cost, cfg.argon2_parallelism)


@lru_cache(maxsize=8)
def _build_dummy_hash(time_cost: int, memory_cost: int, parallelism: int) -> str:
    hasher = _build_hasher(time_cost, memory_cost, parallelism)
    return hasher.hash("dummy_constant_time_mitigation_password_linkvault")


def get_dummy_password_hash(settings: Settings | None = None) -> str:
    cfg = settings or get_settings()
    return _build_dummy_hash(cfg.argon2_time_cost, cfg.argon2_memory_cost, cfg.argon2_parallelism)


def hash_password(password: str, settings: Settings | None = None) -> str:
    return get_password_hasher(settings).hash(password)


def verify_password(password_hash: str, password: str, settings: Settings | None = None) -> bool:
    hasher = get_password_hasher(settings)
    try:
        return hasher.verify(password_hash, password)
    except VerifyMismatchError, VerificationError, InvalidHashError:
        return False


def check_needs_rehash(password_hash: str, settings: Settings | None = None) -> bool:
    hasher = get_password_hasher(settings)
    try:
        return hasher.check_needs_rehash(password_hash)
    except InvalidHashError, VerificationError:
        return True


def verify_dummy_password(password: str, settings: Settings | None = None) -> None:
    dummy_hash = get_dummy_password_hash(settings)
    verify_password(dummy_hash, password, settings)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_password_policy(
    password: str,
    email: str | None = None,
    settings: Settings | None = None,
) -> None:
    cfg = settings or get_settings()
    errors: list[ValidationErrorItem] = []

    if len(password) < cfg.password_min_length:
        errors.append(
            ValidationErrorItem(
                field="password",
                message=f"A senha deve possuir no mínimo {cfg.password_min_length} caracteres.",
                code="string_too_short",
            )
        )
    elif len(password) > cfg.password_max_length:
        errors.append(
            ValidationErrorItem(
                field="password",
                message=f"A senha deve possuir no máximo {cfg.password_max_length} caracteres.",
                code="string_too_long",
            )
        )

    if not password.strip():
        errors.append(
            ValidationErrorItem(
                field="password",
                message="A senha não pode consistir apenas em espaços.",
                code="value_error",
            )
        )

    normalized_pwd = password.strip().lower()
    if normalized_pwd in COMMON_PASSWORDS:
        errors.append(
            ValidationErrorItem(
                field="password",
                message="Esta senha é muito comum e insegura. Escolha outra combinação.",
                code="value_error",
            )
        )

    if email is not None and normalized_pwd == normalize_email(email):
        errors.append(
            ValidationErrorItem(
                field="password",
                message="A senha não pode ser idêntica ao endereço de e-mail.",
                code="value_error",
            )
        )

    if errors:
        raise UnprocessableContentError(
            detail="A senha fornecida não atende aos requisitos de segurança.",
            errors=errors,
        )


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def get_session_cookie_name(settings: Settings | None = None) -> str:
    cfg = settings or get_settings()
    return SESSION_COOKIE_NAME_PROD if cfg.is_production else SESSION_COOKIE_NAME_DEV


def set_session_cookie(
    response: Response,
    raw_token: str,
    settings: Settings | None = None,
) -> None:
    cfg = settings or get_settings()
    response.set_cookie(
        key=get_session_cookie_name(cfg),
        value=raw_token,
        httponly=True,
        secure=cfg.is_production,
        samesite="lax",
        path="/",
        max_age=cfg.session_absolute_ttl_seconds,
    )


def clear_session_cookie(
    response: Response,
    settings: Settings | None = None,
) -> None:
    cfg = settings or get_settings()
    response.delete_cookie(
        key=get_session_cookie_name(cfg),
        path="/",
        httponly=True,
        secure=cfg.is_production,
        samesite="lax",
    )


def extract_session_token(request: Request, settings: Settings | None = None) -> str | None:
    cfg = settings or get_settings()
    cookie_name = get_session_cookie_name(cfg)
    raw_token = request.cookies.get(cookie_name)
    if not raw_token:
        return None
    cleaned = raw_token.strip()
    return cleaned if cleaned else None
