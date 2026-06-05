"""extend reports for rating notes

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-05 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow private safety reports to target rating events and notes."""
    op.add_column(
        "reports",
        sa.Column("target_id", sa.Integer(), nullable=True),
    )
    op.drop_constraint("ck_reports_target_type", "reports", type_="check")
    op.create_check_constraint(
        "ck_reports_target_type",
        "reports",
        "target_type IN ('user', 'profile', 'rating_event', 'rating_note')",
    )
    op.create_index(
        "ix_reports_target_type_target_id",
        "reports",
        ["target_type", "target_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove rating event/note report targeting."""
    op.drop_index("ix_reports_target_type_target_id", table_name="reports")
    op.drop_constraint("ck_reports_target_type", "reports", type_="check")
    op.create_check_constraint(
        "ck_reports_target_type",
        "reports",
        "target_type IN ('user', 'profile')",
    )
    op.drop_column("reports", "target_id")
