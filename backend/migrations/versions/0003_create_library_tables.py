"""create library tables

Revision ID: 0003_create_library_tables
Revises: 0002_create_auth_tables
Create Date: 2026-11-13 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_create_library_tables"
down_revision: str | Sequence[str] | None = "0002_create_auth_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("visibility", sa.String(length=16), server_default="private", nullable=False),
        sa.Column("public_slug", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "visibility IN ('private', 'public')",
            name=op.f("ck_collections_valid_visibility"),
        ),
        sa.CheckConstraint(
            "(visibility = 'public') = (public_slug IS NOT NULL)",
            name=op.f("ck_collections_visibility_slug_consistency"),
        ),
        sa.CheckConstraint(
            "char_length(btrim(name)) >= 1 AND char_length(name) <= 120",
            name=op.f("ck_collections_name_length"),
        ),
        sa.CheckConstraint(
            "description IS NULL OR char_length(description) <= 500",
            name=op.f("ck_collections_description_length"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_collections_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_collections")),
        sa.UniqueConstraint("id", "user_id", name=op.f("uq_collections_id_user_id")),
        sa.UniqueConstraint("public_slug", name=op.f("uq_collections_public_slug")),
    )
    op.create_index(
        "ix_collections_user_id",
        "collections",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(btrim(name)) >= 1 AND char_length(name) <= 60",
            name=op.f("ck_tags_name_length"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_tags_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tags")),
        sa.UniqueConstraint("id", "user_id", name=op.f("uq_tags_id_user_id")),
    )
    op.create_index(
        "uq_tags_user_id_name_lower",
        "tags",
        ["user_id", sa.literal_column("lower(name)")],
        unique=True,
    )

    op.create_table(
        "links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("collection_id", sa.Uuid(), nullable=True),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(btrim(url)) >= 1 AND char_length(url) <= 2048",
            name=op.f("ck_links_url_length"),
        ),
        sa.CheckConstraint(
            "char_length(btrim(title)) >= 1 AND char_length(title) <= 300",
            name=op.f("ck_links_title_length"),
        ),
        sa.CheckConstraint(
            "description IS NULL OR char_length(description) <= 1000",
            name=op.f("ck_links_description_length"),
        ),
        sa.CheckConstraint(
            "notes IS NULL OR char_length(notes) <= 2000",
            name=op.f("ck_links_notes_length"),
        ),
        sa.ForeignKeyConstraint(
            ["collection_id", "user_id"],
            ["collections.id", "collections.user_id"],
            name="fk_links_collection_id_user_id_collections",
            ondelete="SET NULL (collection_id)",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_links_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_links")),
        sa.UniqueConstraint("id", "user_id", name=op.f("uq_links_id_user_id")),
    )
    op.create_index(
        "ix_links_user_created_at_id",
        "links",
        ["user_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_links_user_updated_at_id",
        "links",
        ["user_id", "updated_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_links_user_title_lower_id",
        "links",
        ["user_id", sa.literal_column("lower(title)"), "id"],
        unique=False,
    )
    op.create_index(
        "ix_links_user_collection_id",
        "links",
        ["user_id", "collection_id"],
        unique=False,
    )
    op.create_index(
        "ix_links_title_trgm",
        "links",
        ["title"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"title": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_links_description_trgm",
        "links",
        ["description"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"description": "gin_trgm_ops"},
    )

    op.create_table(
        "link_tags",
        sa.Column("link_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["link_id", "user_id"],
            ["links.id", "links.user_id"],
            name="fk_link_tags_link_id_user_id_links",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id", "user_id"],
            ["tags.id", "tags.user_id"],
            name="fk_link_tags_tag_id_user_id_tags",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("link_id", "tag_id", name=op.f("pk_link_tags")),
    )
    op.create_index(
        "ix_link_tags_user_tag_link",
        "link_tags",
        ["user_id", "tag_id", "link_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("link_tags")
    op.drop_table("links")
    op.drop_table("tags")
    op.drop_table("collections")
