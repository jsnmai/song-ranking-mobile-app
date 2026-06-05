"""add event capture fields

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-05 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Capture source/session metadata needed by future taste-history surfaces."""
    op.add_column(
        "comparisons",
        sa.Column("bucket", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "comparisons",
        sa.Column("comparison_index_in_session", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_comparisons_session_index",
        "comparisons",
        ["session_uuid", "comparison_index_in_session"],
        unique=False,
    )

    op.add_column(
        "rating_events",
        sa.Column("source", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "rating_events",
        sa.Column("comparison_session_uuid", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_rating_events_comparison_session_uuid",
        "rating_events",
        ["comparison_session_uuid"],
        unique=False,
    )
    op.create_index(
        "ix_rating_events_user_source_created_at",
        "rating_events",
        ["user_id", "source", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Remove future taste-history capture metadata."""
    op.drop_index("ix_rating_events_user_source_created_at", table_name="rating_events")
    op.drop_index("ix_rating_events_comparison_session_uuid", table_name="rating_events")
    op.drop_column("rating_events", "comparison_session_uuid")
    op.drop_column("rating_events", "source")

    op.drop_index("ix_comparisons_session_index", table_name="comparisons")
    op.drop_column("comparisons", "comparison_index_in_session")
    op.drop_column("comparisons", "bucket")
