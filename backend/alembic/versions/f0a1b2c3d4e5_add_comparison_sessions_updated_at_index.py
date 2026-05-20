"""add comparison sessions updated at index

Revision ID: f0a1b2c3d4e5
Revises: e2a4f9c8d1b7
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "e2a4f9c8d1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        "ix_comparison_sessions_updated_at",
        "comparison_sessions",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_comparison_sessions_updated_at",
        table_name="comparison_sessions",
    )
