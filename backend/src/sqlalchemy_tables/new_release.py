"""Weekly-cached global New Release feed rows for Discover."""
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class NewRelease(Base):
    """
    One featured fresh release for the global Discover New Release card.

    Rows are produced by the weekly refresh batch (ListenBrainz fresh releases resolved
    through the Apple catalog into durable songs) and read back as a daily-rotating pick.
    `batch_date` keys one batch; `rank` orders picks inside it. `release_group_mbid` is
    unique so one album is never featured across two batches.
    """

    __tablename__ = "new_releases"
    __table_args__ = (
        UniqueConstraint(
            "batch_date",
            "rank",
            name="uq_new_releases_batch_rank",
        ),
        Index(
            "ix_new_releases_release_group_mbid",
            "release_group_mbid",
            unique=True,
        ),
        Index(
            "ix_new_releases_batch_date",
            "batch_date",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int] = mapped_column(
        ForeignKey(
            "songs.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    released_at: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )
    release_group_mbid: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
    )
    batch_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )
    rank: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
