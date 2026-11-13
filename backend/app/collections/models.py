import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class CollectionVisibility(StrEnum):
    PRIVATE = "private"
    PUBLIC = "public"


class Collection(Base):
    __tablename__ = "collections"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_collections_id_user_id"),
        UniqueConstraint("public_slug", name="uq_collections_public_slug"),
        CheckConstraint(
            "visibility IN ('private', 'public')",
            name="valid_visibility",
        ),
        CheckConstraint(
            "(visibility = 'public') = (public_slug IS NOT NULL)",
            name="visibility_slug_consistency",
        ),
        CheckConstraint(
            "char_length(btrim(name)) >= 1 AND char_length(name) <= 120",
            name="name_length",
        ),
        CheckConstraint(
            "description IS NULL OR char_length(description) <= 500",
            name="description_length",
        ),
        Index("ix_collections_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid7,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    visibility: Mapped[CollectionVisibility] = mapped_column(
        String(16),
        nullable=False,
        default=CollectionVisibility.PRIVATE,
        server_default="private",
    )
    public_slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        onupdate=_utc_now,
        server_default=func.now(),
    )
