"""enable pg_trgm extension

Revision ID: 0001_enable_pg_trgm
Revises:
Create Date: 2026-10-30 00:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001_enable_pg_trgm"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
