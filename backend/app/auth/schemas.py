import re
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(
        min_length=3,
        max_length=320,
        description="E-mail único do usuário.",
    )
    password: str = Field(
        min_length=12,
        max_length=128,
        description="Senha em texto puro (12 a 128 caracteres).",
    )
    name: str | None = Field(
        default=None,
        max_length=120,
        description="Nome opcional de exibição.",
    )

    @field_validator("email", mode="before")
    @classmethod
    def validate_and_normalize_email(cls, v: Any) -> str:
        if not isinstance(v, str):
            raise ValueError("O e-mail deve ser um texto.")
        normalized = v.strip().lower()
        if not normalized or len(normalized) > 320 or not _EMAIL_REGEX.match(normalized):
            raise ValueError("Endereço de e-mail inválido.")
        return normalized

    @field_validator("name", mode="before")
    @classmethod
    def sanitize_name(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            cleaned = v.strip()
            return cleaned if cleaned else None
        return str(v)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(
        min_length=3,
        max_length=320,
        description="E-mail do usuário.",
    )
    password: str = Field(
        min_length=1,
        max_length=128,
        description="Senha do usuário.",
    )

    @field_validator("email", mode="before")
    @classmethod
    def normalize_login_email(cls, v: Any) -> str:
        if not isinstance(v, str):
            raise ValueError("O e-mail deve ser um texto.")
        return v.strip().lower()


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(
        min_length=1,
        max_length=128,
        description="Senha atual do usuário.",
    )
    new_password: str = Field(
        min_length=12,
        max_length=128,
        description="Nova senha em texto puro (12 a 128 caracteres).",
    )


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str | None
    is_demo: bool
    expires_at: datetime | None
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserResponse
    csrf_token: str = Field(description="Token sincronizador CSRF associado à sessão.")
