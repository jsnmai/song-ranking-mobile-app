"""add rankings and rating events

Revision ID: b6d8f3a7c9e1
Revises: a81f4d2c9e0b
Create Date: 2026-05-18 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b6d8f3a7c9e1"
down_revision: Union[str, Sequence[str], None] = "a81f4d2c9e0b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "rankings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("song_id", sa.Integer(), nullable=False),
        sa.Column("bucket", sa.String(length=20), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "song_id", name="uq_rankings_user_song"),
    )
    op.create_index(
        "ix_rankings_user_bucket_position",
        "rankings",
        ["user_id", "bucket", "position"],
        unique=False,
    )
    op.create_index(
        "ix_rankings_user_score_id",
        "rankings",
        ["user_id", "score", "id"],
        unique=False,
    )

    op.create_table(
        "rating_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("song_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=20), nullable=False),
        sa.Column("previous_bucket", sa.String(length=20), nullable=True),
        sa.Column("new_bucket", sa.String(length=20), nullable=True),
        sa.Column("previous_position", sa.Integer(), nullable=True),
        sa.Column("new_position", sa.Integer(), nullable=True),
        sa.Column("previous_score", sa.Float(), nullable=True),
        sa.Column("new_score", sa.Float(), nullable=True),
        sa.Column("note", sa.String(length=280), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_rating_events_user_created_at",
        "rating_events",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_rating_events_song_created_at",
        "rating_events",
        ["song_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_rating_events_song_created_at", table_name="rating_events")
    op.drop_index("ix_rating_events_user_created_at", table_name="rating_events")
    op.drop_table("rating_events")
    op.drop_index("ix_rankings_user_score_id", table_name="rankings")
    op.drop_index("ix_rankings_user_bucket_position", table_name="rankings")
    op.drop_table("rankings")
