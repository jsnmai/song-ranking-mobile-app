# SQLAlchemy model for provider-specific song identifiers.
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class SongProviderRef(Base):
    """
    Provider lookup metadata for durable LISTn songs.

    Search remains transient; this table only records provider identities for songs
    that have entered LISTn's graph through rating, bookmarking, or another user action.
    """

    __tablename__ = "song_provider_refs"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_track_id",
            "storefront",
            name="uq_song_provider_refs_provider_track_storefront",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int] = mapped_column(
        ForeignKey("songs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    provider_track_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )
    provider_artist_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )
    provider_album_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )
    storefront: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        server_default="global",
    )
    url: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )
    artwork_url: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )
    preview_available: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )
    confidence: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    matched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
