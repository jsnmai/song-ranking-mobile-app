"""add preview_url_expires_at to songs

Revision ID: a2b3c4d5e6f7
Revises: 894c3069fb96
Create Date: 2026-05-20 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f7"
down_revision: str | Sequence[str] | None = "894c3069fb96"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add preview_url_expires_at to songs."""
    op.add_column(
        "songs",
        sa.Column(
            "preview_url_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Remove preview_url_expires_at from songs."""
    op.drop_column("songs", "preview_url_expires_at")
