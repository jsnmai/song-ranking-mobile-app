"""add reports table

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-05 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create private safety reports for user/profile reporting."""
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("reporter_user_id", sa.Integer(), nullable=True),
        sa.Column("reported_user_id", sa.Integer(), nullable=True),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.String(length=40), nullable=False),
        sa.Column("details", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="open", nullable=False),
        sa.Column("resolution", sa.String(length=1000), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "target_type IN ('user', 'profile')",
            name="ck_reports_target_type",
        ),
        sa.CheckConstraint(
            "reason IN ("
            "'harassment', "
            "'hate_or_abuse', "
            "'impersonation', "
            "'inappropriate_content', "
            "'spam', "
            "'under_13', "
            "'other'"
            ")",
            name="ck_reports_reason",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'reviewed', 'actioned', 'dismissed')",
            name="ck_reports_status",
        ),
        sa.ForeignKeyConstraint(["reported_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reporter_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reports_reported_user_id"), "reports", ["reported_user_id"], unique=False)
    op.create_index(op.f("ix_reports_reporter_user_id"), "reports", ["reporter_user_id"], unique=False)
    op.create_index(
        "ix_reports_reported_user_created_at",
        "reports",
        ["reported_user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_reports_status_created_at",
        "reports",
        ["status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Drop private safety reports."""
    op.drop_index("ix_reports_status_created_at", table_name="reports")
    op.drop_index("ix_reports_reported_user_created_at", table_name="reports")
    op.drop_index(op.f("ix_reports_reporter_user_id"), table_name="reports")
    op.drop_index(op.f("ix_reports_reported_user_id"), table_name="reports")
    op.drop_table("reports")
