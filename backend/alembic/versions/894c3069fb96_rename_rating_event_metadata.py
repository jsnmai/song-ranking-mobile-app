"""rename rating event metadata

Revision ID: 894c3069fb96
Revises: a9c8e7d6f5b4
Create Date: 2026-05-20 10:08:57.473430

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "894c3069fb96"
down_revision: str | Sequence[str] | None = "a9c8e7d6f5b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "rating_events",
        "metadata",
        new_column_name="event_metadata",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "rating_events",
        "event_metadata",
        new_column_name="metadata",
    )
