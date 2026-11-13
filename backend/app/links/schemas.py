import uuid
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.tags.schemas import TagResponse, sanitize_tag_name

MAX_TAGS_PER_LINK: int = 30


def validate_http_url(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("A URL deve ser um texto.")
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("A URL não pode estar em branco.")
    if any(ch.isspace() for ch in cleaned):
        raise ValueError("A URL não pode conter espaços.")
    parsed = urlsplit(cleaned)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("A URL deve ser válida e utilizar o esquema http ou https.")
    return cleaned


def _sanitize_title(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("O título do link deve ser um texto.")
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("O título do link não pode estar em branco.")
    return cleaned


def _sanitize_optional_text(value: Any, *, field_label: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field_label} deve ser um texto.")
    cleaned = value.strip()
    return cleaned if cleaned else None


def _validate_tag_names(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("A lista de tags deve ser um array de textos.")
    if len(value) > MAX_TAGS_PER_LINK:
        raise ValueError(f"Um link pode ter no máximo {MAX_TAGS_PER_LINK} tags.")
    cleaned_list: list[str] = []
    for item in value:
        name = sanitize_tag_name(item)
        if len(name) > 60:
            raise ValueError("Cada tag deve ter no máximo 60 caracteres.")
        cleaned_list.append(name)
    return cleaned_list


class LinkCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=2048, description="URL destino (http ou https).")
    title: str = Field(min_length=1, max_length=300, description="Título do link.")
    description: str | None = Field(
        default=None,
        max_length=1000,
        description="Descrição opcional.",
    )
    notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Notas pessoais privadas.",
    )
    collection_id: uuid.UUID | None = Field(
        default=None,
        description="ID da coleção opcional.",
    )
    tags: list[str] = Field(
        default_factory=list,
        max_length=MAX_TAGS_PER_LINK,
        description="Nomes das tags associadas (criadas automaticamente se não existirem).",
    )

    @field_validator("url", mode="before")
    @classmethod
    def validate_url(cls, v: Any) -> str:
        return validate_http_url(v)

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> str:
        return _sanitize_title(v)

    @field_validator("description", mode="before")
    @classmethod
    def validate_description(cls, v: Any) -> str | None:
        return _sanitize_optional_text(v, field_label="A descrição")

    @field_validator("notes", mode="before")
    @classmethod
    def validate_notes(cls, v: Any) -> str | None:
        return _sanitize_optional_text(v, field_label="As notas pessoais")

    @field_validator("tags", mode="before")
    @classmethod
    def validate_tags(cls, v: Any) -> list[str]:
        return _validate_tag_names(v)


class LinkUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str | None = Field(
        default=None,
        min_length=1,
        max_length=2048,
        description="Nova URL (http ou https).",
    )
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=300,
        description="Novo título.",
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
        description="Nova descrição (null ou vazio limpa).",
    )
    notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Novas notas privadas (null ou vazio limpa).",
    )
    collection_id: uuid.UUID | None = Field(
        default=None,
        description="Nova coleção (null remove da coleção).",
    )
    tags: list[str] | None = Field(
        default=None,
        max_length=MAX_TAGS_PER_LINK,
        description=(
            "Nova lista de nomes de tags (se omitida, preserva as atuais; se [], remove todas)."
        ),
    )

    @field_validator("url", mode="before")
    @classmethod
    def validate_url(cls, v: Any) -> str:
        if v is None:
            raise ValueError("A URL não pode ser nula.")
        return validate_http_url(v)

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> str:
        if v is None:
            raise ValueError("O título do link não pode ser nulo.")
        return _sanitize_title(v)

    @field_validator("description", mode="before")
    @classmethod
    def validate_description(cls, v: Any) -> str | None:
        return _sanitize_optional_text(v, field_label="A descrição")

    @field_validator("notes", mode="before")
    @classmethod
    def validate_notes(cls, v: Any) -> str | None:
        return _sanitize_optional_text(v, field_label="As notas pessoais")

    @field_validator("tags", mode="before")
    @classmethod
    def validate_tags(cls, v: Any) -> list[str]:
        if v is None:
            raise ValueError("A lista de tags não pode ser nula.")
        return _validate_tag_names(v)


class LinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    collection_id: uuid.UUID | None
    url: str
    title: str
    description: str | None
    notes: str | None
    tags: list[TagResponse]
    created_at: datetime
    updated_at: datetime


class LinkListResponse(BaseModel):
    items: list[LinkResponse]
    next_cursor: str | None = None
