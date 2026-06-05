"""add visibility blocks age gate

Revision ID: e5f6a7b8c9d0
Revises: c2d3e4f5a6b7
Create Date: 2026-06-04 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add privacy visibility, blocking, and age-verification columns."""
    op.add_column(
        "profiles",
        sa.Column(
            "visibility",
            sa.String(length=20),
            server_default="public",
            nullable=False,
        ),
    )
    op.execute("UPDATE profiles SET visibility = CASE WHEN is_public THEN 'public' ELSE 'only_me' END")
    op.create_index(
        "ix_profiles_user_visibility",
        "profiles",
        ["user_id", "visibility"],
        unique=False,
    )

    op.add_column(
        "users",
        sa.Column(
            "age_verified_13_plus",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "age_verified_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "age_gate_version",
            sa.String(length=20),
            nullable=True,
        ),
    )

    op.create_table(
        "blocks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("blocker_id", sa.Integer(), nullable=False),
        sa.Column("blocked_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("blocker_id <> blocked_id", name="ck_blocks_no_self_block"),
        sa.ForeignKeyConstraint(["blocked_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocker_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("blocker_id", "blocked_id", name="uq_blocks_blocker_blocked"),
    )
    op.create_index(
        op.f("ix_blocks_blocked_id"),
        "blocks",
        ["blocked_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_blocks_blocker_id"),
        "blocks",
        ["blocker_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove privacy visibility, blocking, and age-verification columns."""
    op.drop_index(op.f("ix_blocks_blocker_id"), table_name="blocks")
    op.drop_index(op.f("ix_blocks_blocked_id"), table_name="blocks")
    op.drop_table("blocks")

    op.drop_column("users", "age_gate_version")
    op.drop_column("users", "age_verified_at")
    op.drop_column("users", "age_verified_13_plus")

    op.drop_index("ix_profiles_user_visibility", table_name="profiles")
    op.drop_column("profiles", "visibility")
