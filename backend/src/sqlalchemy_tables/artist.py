# SQLAlchemy models for normalized artist identity and song credits.
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Artist(Base):
    """
    Canonical artist identity for analytics.

    `songs.artist` remains the provider display credit for song rows. Artist rows
    are used only when a structured source, currently MusicBrainz, gives us a
    stable artist identity.
    """

    __tablename__ = "artists"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    musicbrainz_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        unique=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class SongArtistCredit(Base):
    """
    Structured artist credits for one song.

    Multiple rows let a collaboration count toward each individual artist in
    taste analytics while preserving the original song display credit elsewhere.
    """

    __tablename__ = "song_artist_credits"
    __table_args__ = (
        UniqueConstraint(
            "song_id",
            "artist_id",
            name="uq_song_artist_credits_song_artist",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int] = mapped_column(
        ForeignKey("songs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    artist_id: Mapped[int] = mapped_column(
        ForeignKey("artists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    credited_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    join_phrase: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    confidence: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
