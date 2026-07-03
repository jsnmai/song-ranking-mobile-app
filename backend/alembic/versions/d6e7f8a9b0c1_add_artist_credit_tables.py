"""add artist credit tables

Revision ID: d6e7f8a9b0c1
Revises: c5e8a2d9f4b1
Create Date: 2026-07-03 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "c5e8a2d9f4b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "songs",
        sa.Column("artist_credits_enriched_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "artists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("musicbrainz_id", sa.String(length=36), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("musicbrainz_id"),
    )
    op.create_table(
        "song_artist_credits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("song_id", sa.Integer(), nullable=False),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("credited_name", sa.String(length=255), nullable=False),
        sa.Column("join_phrase", sa.String(length=32), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("confidence", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "song_id",
            "artist_id",
            name="uq_song_artist_credits_song_artist",
        ),
    )
    op.create_index("ix_song_artist_credits_artist_id", "song_artist_credits", ["artist_id"])
    op.create_index("ix_song_artist_credits_song_id", "song_artist_credits", ["song_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_song_artist_credits_song_id", table_name="song_artist_credits")
    op.drop_index("ix_song_artist_credits_artist_id", table_name="song_artist_credits")
    op.drop_table("song_artist_credits")
    op.drop_table("artists")
    op.drop_column("songs", "artist_credits_enriched_at")
