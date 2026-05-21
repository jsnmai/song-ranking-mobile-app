"""add feed indexes

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add indexes used by the fan-out-on-read feed query."""
    op.create_index(
        "ix_rating_events_user_created_at_id",
        "rating_events",
        ["user_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_profiles_user_public",
        "profiles",
        ["user_id", "is_public"],
        unique=False,
    )


def downgrade() -> None:
    """Drop feed query indexes."""
    op.drop_index(
        "ix_profiles_user_public",
        table_name="profiles",
    )
    op.drop_index(
        "ix_rating_events_user_created_at_id",
        table_name="rating_events",
    )
