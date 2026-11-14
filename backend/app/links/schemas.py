import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.tags.schemas import TagResponse, sanitize_tag_name

MAX_TAGS_PER_LINK: int = 30
DEFAULT_PAGE_LIMIT: int = 20
MAX_PAGE_LIMIT: int = 100
MAX_SEARCH_QUERY_LENGTH: int = 200


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


class LinkSortOption(StrEnum):
    CREATED_DESC = "created_desc"
    CREATED_ASC = "created_asc"
    TITLE_ASC = "title_asc"
    TITLE_DESC = "title_desc"
    UPDATED_DESC = "updated_desc"


class LinkListQueryParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: str | None = Field(
        default=None,
        max_length=MAX_SEARCH_QUERY_LENGTH,
        description="Termo de busca parcial ou por similaridade (pg_trgm) em título e descrição.",
    )
    collection_id: uuid.UUID | None = Field(
        default=None,
        description="Filtra links pertencentes a uma coleção específica do usuário.",
    )
    tag: str | None = Field(
        default=None,
        max_length=60,
        description="Filtra links pelo nome da tag (case-insensitive).",
    )
    tag_id: uuid.UUID | None = Field(
        default=None,
        description="Filtra links pelo ID da tag.",
    )
    sort: LinkSortOption = Field(
        default=LinkSortOption.CREATED_DESC,
        description="Critério de ordenação determinística.",
    )
    limit: int = Field(
        default=DEFAULT_PAGE_LIMIT,
        ge=1,
        le=MAX_PAGE_LIMIT,
        description="Quantidade máxima de itens por página (1 a 100).",
    )
    cursor: str | None = Field(
        default=None,
        max_length=512,
        description="Cursor opaco (base64url) retornado na página anterior.",
    )

    @field_validator("q", "tag", "cursor", mode="before")
    @classmethod
    def _strip_optional_query_strings(cls, v: Any) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str):
            raise ValueError("O parâmetro de consulta deve ser um texto.")
        cleaned = v.strip()
        return cleaned if cleaned else None
