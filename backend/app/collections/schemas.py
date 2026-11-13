import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.collections.models import CollectionVisibility


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


class CollectionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120, description="Nome da coleção.")
    description: str | None = Field(
        default=None,
        max_length=500,
        description="Descrição opcional da coleção.",
    )

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: Any) -> str:
        return _sanitize_name(v)

    @field_validator("description", mode="before")
    @classmethod
    def validate_description(cls, v: Any) -> str | None:
        return _sanitize_description(v)


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
