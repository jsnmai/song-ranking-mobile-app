"""add notifications table

Revision ID: f1a2b3c4d5e6
Revises: a3d9f1e7c2b8
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "a3d9f1e7c2b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create in-app notifications (follows + likes)."""
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipient_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("rating_event_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rating_event_id"], ["rating_events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notifications_recipient_created_at_id",
        "notifications",
        ["recipient_id", "created_at", "id"],
        unique=False,
    )
    # One follow notification per (recipient, actor); follows carry no target event.
    op.create_index(
        "uq_notifications_follow",
        "notifications",
        ["recipient_id", "actor_id"],
        unique=True,
        postgresql_where=sa.text("type = 'follow'"),
    )
    # One like notification per (recipient, actor, liked activity).
    op.create_index(
        "uq_notifications_like",
        "notifications",
        ["recipient_id", "actor_id", "rating_event_id"],
        unique=True,
        postgresql_where=sa.text("type = 'like'"),
    )


def downgrade() -> None:
    """Drop in-app notifications."""
    op.drop_index("uq_notifications_like", table_name="notifications")
    op.drop_index("uq_notifications_follow", table_name="notifications")
    op.drop_index("ix_notifications_recipient_created_at_id", table_name="notifications")
    op.drop_table("notifications")
