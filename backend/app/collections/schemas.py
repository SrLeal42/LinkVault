import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.collections.models import CollectionVisibility

MAX_COLLECTION_BATCH_LINKS: int = 200


def _sanitize_name(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("O nome da coleção deve ser um texto.")
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("O nome da coleção não pode estar em branco.")
    return cleaned


def _sanitize_description(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("A descrição deve ser um texto.")
    cleaned = value.strip()
    return cleaned if cleaned else None


def _validate_link_ids(value: Any) -> list[uuid.UUID] | None:
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("A lista de links deve ser um array de identificadores UUID.")
    if len(value) > MAX_COLLECTION_BATCH_LINKS:
        raise ValueError(
            f"Não é possível associar mais de {MAX_COLLECTION_BATCH_LINKS} links por operação."
        )
    deduped: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    for item in value:
        try:
            parsed = item if isinstance(item, uuid.UUID) else uuid.UUID(str(item))
        except (ValueError, TypeError) as err:
            raise ValueError("Cada identificador de link deve ser um UUID válido.") from err
        if parsed not in seen:
            seen.add(parsed)
            deduped.append(parsed)
    return deduped


class CollectionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120, description="Nome da coleção.")
    description: str | None = Field(
        default=None,
        max_length=500,
        description="Descrição opcional da coleção.",
    )
    link_ids: list[uuid.UUID] | None = Field(
        default=None,
        max_length=MAX_COLLECTION_BATCH_LINKS,
        description=(
            "Lista opcional de IDs de links existentes do usuário para associar à coleção."
        ),
    )

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: Any) -> str:
        return _sanitize_name(v)

    @field_validator("description", mode="before")
    @classmethod
    def validate_description(cls, v: Any) -> str | None:
        return _sanitize_description(v)

    @field_validator("link_ids", mode="before")
    @classmethod
    def validate_link_ids(cls, v: Any) -> list[uuid.UUID] | None:
        return _validate_link_ids(v)


class CollectionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=120,
        description="Novo nome da coleção.",
    )
    description: str | None = Field(
        default=None,
        max_length=500,
        description="Nova descrição da coleção (null ou vazio remove a descrição).",
    )
    link_ids: list[uuid.UUID] | None = Field(
        default=None,
        max_length=MAX_COLLECTION_BATCH_LINKS,
        description=(
            "Lista opcional de IDs de links existentes do usuário para sincronizar com a coleção."
        ),
    )

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: Any) -> str:
        if v is None:
            raise ValueError("O nome da coleção não pode ser nulo.")
        return _sanitize_name(v)

    @field_validator("description", mode="before")
    @classmethod
    def validate_description(cls, v: Any) -> str | None:
        return _sanitize_description(v)

    @field_validator("link_ids", mode="before")
    @classmethod
    def validate_link_ids(cls, v: Any) -> list[uuid.UUID] | None:
        return _validate_link_ids(v)


class CollectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    visibility: CollectionVisibility
    public_slug: str | None
    link_count: int = Field(ge=0, description="Quantidade de links pertencentes à coleção.")
    created_at: datetime
    updated_at: datetime


class CollectionListResponse(BaseModel):
    items: list[CollectionResponse]
