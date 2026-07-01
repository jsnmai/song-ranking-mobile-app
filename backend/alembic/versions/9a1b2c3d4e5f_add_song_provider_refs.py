"""add song provider refs

Revision ID: 9a1b2c3d4e5f
Revises: f2b9d4a1c7e3
Create Date: 2026-06-30 22:20:00.000000
"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "9a1b2c3d4e5f"
down_revision: str | Sequence[str] | None = "f2b9d4a1c7e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create provider refs and backfill existing Deezer identifiers."""
    op.create_table(
        "song_provider_refs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("song_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("provider_track_id", sa.String(length=128), nullable=False),
        sa.Column("provider_artist_id", sa.String(length=128), nullable=True),
        sa.Column("provider_album_id", sa.String(length=128), nullable=True),
        sa.Column(
            "storefront",
            sa.String(length=8),
            server_default="global",
            nullable=False,
        ),
        sa.Column("url", sa.String(length=1000), nullable=True),
        sa.Column("artwork_url", sa.String(length=1000), nullable=True),
        sa.Column("preview_available", sa.Boolean(), nullable=True),
        sa.Column("confidence", sa.String(length=64), nullable=True),
        sa.Column("matched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider",
            "provider_track_id",
            "storefront",
            name="uq_song_provider_refs_provider_track_storefront",
        ),
    )
    op.create_index(
        op.f("ix_song_provider_refs_provider"),
        "song_provider_refs",
        ["provider"],
        unique=False,
    )
    op.create_index(
        op.f("ix_song_provider_refs_song_id"),
        "song_provider_refs",
        ["song_id"],
        unique=False,
    )
    op.execute(
        """
        INSERT INTO song_provider_refs (
            song_id,
            provider,
            provider_track_id,
            provider_artist_id,
            storefront,
            artwork_url,
            preview_available,
            confidence,
            matched_at
        )
        SELECT
            id,
            'deezer_legacy',
            deezer_id::text,
            artist_deezer_id::text,
            'global',
            cover_url,
            preview_url IS NOT NULL,
            'deezer_legacy',
            now()
        FROM songs
        WHERE deezer_id IS NOT NULL
        ON CONFLICT (provider, provider_track_id, storefront) DO NOTHING
        """
    )
    op.alter_column(
        "songs",
        "deezer_id",
        existing_type=sa.BigInteger(),
        nullable=True,
    )
    op.alter_column(
        "songs",
        "artist_deezer_id",
        existing_type=sa.BigInteger(),
        nullable=True,
    )


def downgrade() -> None:
    """Drop provider refs and restore pre-S1 Deezer constraints."""
    # Downgrading after Apple songs exist would require deleting LISTn-owned ratings
    # or inventing fake Deezer IDs. Refuse instead; older schema constraints are safe
    # to restore only while every song still has legacy Deezer identifiers.
    connection = op.get_bind()
    nullable_provider_rows = connection.execute(
        sa.text(
            """
            SELECT count(*)
            FROM songs
            WHERE deezer_id IS NULL
               OR artist_deezer_id IS NULL
            """
        )
    ).scalar_one()
    if nullable_provider_rows > 0:
        raise RuntimeError(
            "Cannot downgrade song_provider_refs while songs without legacy Deezer "
            "identifiers exist. Remove those rows and dependent user data manually "
            "only after an explicit rollback plan."
        )

    op.alter_column(
        "songs",
        "artist_deezer_id",
        existing_type=sa.BigInteger(),
        nullable=False,
    )
    op.alter_column(
        "songs",
        "deezer_id",
        existing_type=sa.BigInteger(),
        nullable=False,
    )
    op.drop_index(
        op.f("ix_song_provider_refs_song_id"),
        table_name="song_provider_refs",
    )
    op.drop_index(
        op.f("ix_song_provider_refs_provider"),
        table_name="song_provider_refs",
    )
    op.drop_table("song_provider_refs")
