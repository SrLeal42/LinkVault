import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


def sanitize_tag_name(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("O nome da tag deve ser um texto.")
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("O nome da tag não pode estar em branco.")
    return cleaned


class TagCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=60, description="Nome da tag.")

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: Any) -> str:
        return sanitize_tag_name(v)


class TagUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=60, description="Novo nome da tag.")

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: Any) -> str:
        return sanitize_tag_name(v)


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime


class TagListResponse(BaseModel):
    items: list[TagResponse]
