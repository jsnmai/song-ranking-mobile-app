"""add saved songs

Revision ID: e6f7a8b9c0d1
Revises: d9e0f1a2b3c4
Create Date: 2026-06-06 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add private current-user Saved Songs rows."""
    op.create_table(
        "saved_songs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("song_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=30), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "song_id", name="uq_saved_songs_user_song"),
    )
    op.create_index(
        "ix_saved_songs_user_created_at",
        "saved_songs",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Remove Saved Songs."""
    op.drop_index("ix_saved_songs_user_created_at", table_name="saved_songs")
    op.drop_table("saved_songs")
