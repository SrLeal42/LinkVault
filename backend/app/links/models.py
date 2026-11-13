import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.collections.models import Collection
from app.core.db import Base
from app.tags.models import Tag


def _utc_now() -> datetime:
    return datetime.now(UTC)


class Link(Base):
    __tablename__ = "links"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_links_id_user_id"),
        ForeignKeyConstraint(
            ["collection_id", "user_id"],
            ["collections.id", "collections.user_id"],
            name="fk_links_collection_id_user_id_collections",
            ondelete="SET NULL (collection_id)",
        ),
        CheckConstraint(
            "char_length(btrim(url)) >= 1 AND char_length(url) <= 2048",
            name="url_length",
        ),
        CheckConstraint(
            "char_length(btrim(title)) >= 1 AND char_length(title) <= 300",
            name="title_length",
        ),
        CheckConstraint(
            "description IS NULL OR char_length(description) <= 1000",
            name="description_length",
        ),
        CheckConstraint(
            "notes IS NULL OR char_length(notes) <= 2000",
            name="notes_length",
        ),
        Index("ix_links_user_created_at_id", "user_id", "created_at", "id"),
        Index("ix_links_user_updated_at_id", "user_id", "updated_at", "id"),
        Index("ix_links_user_title_lower_id", "user_id", text("lower(title)"), "id"),
        Index("ix_links_user_collection_id", "user_id", "collection_id"),
        Index(
            "ix_links_title_trgm",
            "title",
            postgresql_using="gin",
            postgresql_ops={"title": "gin_trgm_ops"},
        ),
        Index(
            "ix_links_description_trgm",
            "description",
            postgresql_using="gin",
            postgresql_ops={"description": "gin_trgm_ops"},
        ),
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
    collection_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
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

    collection: Mapped[Collection | None] = relationship(
        foreign_keys=[collection_id, user_id],
        primaryjoin=(
            "and_(Link.collection_id == Collection.id, Link.user_id == Collection.user_id)"
        ),
    )
    link_tags: Mapped[list[LinkTag]] = relationship(
        back_populates="link",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="[LinkTag.link_id, LinkTag.user_id]",
        primaryjoin="and_(Link.id == LinkTag.link_id, Link.user_id == LinkTag.user_id)",
    )
    tags: Mapped[list[Tag]] = relationship(
        secondary="link_tags",
        primaryjoin="and_(Link.id == LinkTag.link_id, Link.user_id == LinkTag.user_id)",
        secondaryjoin="and_(Tag.id == LinkTag.tag_id, Tag.user_id == LinkTag.user_id)",
        viewonly=True,
    )


class LinkTag(Base):
    __tablename__ = "link_tags"
    __table_args__ = (
        ForeignKeyConstraint(
            ["link_id", "user_id"],
            ["links.id", "links.user_id"],
            name="fk_link_tags_link_id_user_id_links",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["tag_id", "user_id"],
            ["tags.id", "tags.user_id"],
            name="fk_link_tags_tag_id_user_id_tags",
            ondelete="CASCADE",
        ),
        Index("ix_link_tags_user_tag_link", "user_id", "tag_id", "link_id"),
    )

    link_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)

    link: Mapped[Link] = relationship(
        back_populates="link_tags",
        foreign_keys=[link_id, user_id],
        primaryjoin="and_(LinkTag.link_id == Link.id, LinkTag.user_id == Link.user_id)",
        overlaps="link_tags",
    )
    tag: Mapped[Tag] = relationship(
        foreign_keys=[tag_id, user_id],
        primaryjoin="and_(LinkTag.tag_id == Tag.id, LinkTag.user_id == Tag.user_id)",
        overlaps="link,link_tags",
    )
