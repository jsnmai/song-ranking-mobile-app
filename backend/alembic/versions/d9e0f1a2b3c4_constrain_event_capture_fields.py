"""constrain event capture fields

Revision ID: d9e0f1a2b3c4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-05 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Keep future event-capture fields enum-like without blocking old nullable rows."""
    op.create_check_constraint(
        "ck_rating_events_source",
        "rating_events",
        "source IS NULL OR source IN ('direct', 'comparison', 'remove', 'reorder')",
    )
    op.create_check_constraint(
        "ck_comparisons_bucket",
        "comparisons",
        "bucket IS NULL OR bucket IN ('like', 'alright', 'dislike')",
    )
    op.create_check_constraint(
        "ck_comparisons_index_positive",
        "comparisons",
        "comparison_index_in_session IS NULL OR comparison_index_in_session >= 1",
    )


def downgrade() -> None:
    """Remove enum-like capture constraints."""
    op.drop_constraint("ck_comparisons_index_positive", "comparisons", type_="check")
    op.drop_constraint("ck_comparisons_bucket", "comparisons", type_="check")
    op.drop_constraint("ck_rating_events_source", "rating_events", type_="check")
