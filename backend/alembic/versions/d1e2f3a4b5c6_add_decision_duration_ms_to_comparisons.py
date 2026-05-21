"""add decision_duration_ms to comparisons

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Store how long a user took to make each comparison decision."""
    op.add_column(
        "comparisons",
        sa.Column(
            "decision_duration_ms",
            sa.Integer(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Remove comparison decision duration analytics."""
    op.drop_column(
        "comparisons",
        "decision_duration_ms",
    )
