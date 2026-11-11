import hashlib
import ipaddress
import re
import secrets
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import Settings, get_settings
from app.core.errors import (
    AppError,
    CSRFError,
    UnprocessableContentError,
    ValidationErrorItem,
    app_error_handler,
)

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

CSRF_HEADER_NAME: str = "X-CSRF-Token"
SAFE_METHODS: frozenset[str] = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})


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


def normalize_origin(url_or_origin: str) -> str | None:
    cleaned = url_or_origin.strip()
    if not cleaned or cleaned.lower() == "null":
        return None
    parsed = urlsplit(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def verify_request_origin(request: Request, settings: Settings | None = None) -> None:
    if request.method.upper() in SAFE_METHODS:
        return
    cfg = settings or get_settings()
    raw_source = request.headers.get("origin") or request.headers.get("referer")
    if not raw_source:
        raise CSRFError(detail="Cabeçalho Origin ou Referer ausente na requisição.")
    request_origin = normalize_origin(raw_source)
    allowed = {
        norm for origin in cfg.allowed_origins if (norm := normalize_origin(origin)) is not None
    }
    if request_origin is None or request_origin not in allowed:
        raise CSRFError(detail="Origem da requisição não permitida.")


def verify_request_content_type(request: Request) -> None:
    method = request.method.upper()
    if method in SAFE_METHODS:
        return
    raw_content_type = request.headers.get("content-type")
    content_length_raw = request.headers.get("content-length", "0").strip()
    has_body = (
        content_length_raw.isdigit() and int(content_length_raw) > 0
    ) or "transfer-encoding" in request.headers
    if raw_content_type is not None:
        media_type = raw_content_type.split(";", 1)[0].strip().lower()
        if media_type != "application/json":
            raise CSRFError(
                detail="Content-Type inválido. Endpoints de escrita exigem application/json."
            )
        return
    if has_body or method in {"PUT", "PATCH"}:
        raise CSRFError(detail="Content-Type application/json é obrigatório para esta requisição.")


def verify_csrf_token(request: Request, expected_token: str) -> None:
    provided_token = request.headers.get(CSRF_HEADER_NAME)
    if (
        not provided_token
        or not expected_token
        or not secrets.compare_digest(provided_token, expected_token)
    ):
        raise CSRFError(detail="Token CSRF ausente ou inválido.")


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method.upper() not in SAFE_METHODS:
            try:
                verify_request_origin(request)
                verify_request_content_type(request)
            except AppError as exc:
                return app_error_handler(request, exc)
        return await call_next(request)


RateLimitKeyPrefix = Literal["ip", "email"]


def hash_rate_limit_key(prefix: RateLimitKeyPrefix, raw_value: str) -> str:
    normalized = f"{prefix}:{raw_value.strip().lower()}"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def extract_client_ip(request: Request, settings: Settings | None = None) -> str:
    cfg = settings or get_settings()
    if cfg.trusted_proxy_count > 0:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            parts = [part.strip() for part in xff.split(",") if part.strip()]
            if parts:
                idx = -min(len(parts), cfg.trusted_proxy_count)
                candidate = parts[idx]
                try:
                    return str(ipaddress.ip_address(candidate))
                except ValueError:
                    pass

    if request.client and request.client.host:
        return request.client.host
    return "unknown"
