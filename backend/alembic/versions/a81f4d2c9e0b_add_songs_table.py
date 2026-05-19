"""add songs table

Revision ID: a81f4d2c9e0b
Revises: f99b444fc62b
Create Date: 2026-05-18 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a81f4d2c9e0b"
down_revision: Union[str, Sequence[str], None] = "f99b444fc62b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "songs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("deezer_id", sa.Integer(), nullable=False),
        sa.Column("isrc", sa.String(length=12), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("artist", sa.String(length=255), nullable=False),
        sa.Column("artist_deezer_id", sa.Integer(), nullable=False),
        sa.Column("album", sa.String(length=255), nullable=False),
        sa.Column("cover_url", sa.String(length=1000), nullable=False),
        sa.Column("preview_url", sa.String(length=1000), nullable=True),
        sa.Column("genre_deezer", sa.String(length=120), nullable=True),
        sa.Column("musicbrainz_id", sa.String(length=36), nullable=True),
        sa.Column("genres_mb", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("release_year", sa.Integer(), nullable=True),
        sa.Column("spotify_energy", sa.Float(), nullable=True),
        sa.Column("spotify_valence", sa.Float(), nullable=True),
        sa.Column("spotify_tempo", sa.Float(), nullable=True),
        sa.Column("spotify_danceability", sa.Float(), nullable=True),
        sa.Column("metadata_enriched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("spotify_enriched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_songs_deezer_id", "songs", ["deezer_id"], unique=True)
    op.create_index("ix_songs_isrc", "songs", ["isrc"], unique=False)
    op.create_index("ix_songs_genres_mb", "songs", ["genres_mb"], unique=False, postgresql_using="gin")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_songs_genres_mb", table_name="songs", postgresql_using="gin")
    op.drop_index("ix_songs_isrc", table_name="songs")
    op.drop_index("ix_songs_deezer_id", table_name="songs")
    op.drop_table("songs")
