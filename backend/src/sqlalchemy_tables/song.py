# SQLAlchemy model for the `songs` table.
# Songs are persisted only after a user rates, bookmarks, or otherwise acts on a search result.
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Song(Base):
    """
    Durable music metadata for songs that have entered LISTn's product graph.

    Search results are transient. A row is created only after user action so LISTn
    does not become a bulk mirror of Deezer or any other provider catalog.
    """

    __tablename__ = "songs"
    __table_args__ = (
        Index(
            "ix_songs_deezer_id",
            "deezer_id",
            unique=True,
        ),
        Index(
            "ix_songs_isrc",
            "isrc",
        ),
        Index(
            "ix_songs_genres_mb",
            "genres_mb",
            postgresql_using="gin",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    deezer_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )
    isrc: Mapped[str | None] = mapped_column(
        String(12),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    artist: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    artist_deezer_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )
    album: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    cover_url: Mapped[str] = mapped_column(
        String(1000),
        nullable=False,
    )
    preview_url: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )
    genre_deezer: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )
    musicbrainz_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
    )
    genres_mb: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )
    release_year: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    spotify_energy: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    spotify_valence: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    spotify_tempo: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    spotify_danceability: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    metadata_enriched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    spotify_enriched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Akamai exp= timestamp parsed from preview_url at insert/refresh time.
    # Null means the URL was stored before expiry tracking was added.
    preview_url_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Aggregate statistics across all users (Phase 10). Kept on the songs row so
    # reads are O(1) without a GROUP BY. Null avg means no ratings exist yet.
    global_avg_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    global_rating_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
