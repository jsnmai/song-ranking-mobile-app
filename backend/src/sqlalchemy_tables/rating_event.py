# SQLAlchemy model for the `rating_events` table.
# Append-only product history for ratings, removals, and future rerates/reorders.
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class RatingEvent(Base):
    """
    Immutable record of an intentional user rating action.

    Passive score shifts for surrounding songs are intentionally not recorded here.
    Future analytics can derive interval/snapshot tables from ranking writes.
    """

    __tablename__ = "rating_events"
    __table_args__ = (
        Index(
            "ix_rating_events_user_created_at",
            "user_id",
            "created_at",
        ),
        Index(
            "ix_rating_events_song_created_at",
            "song_id",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    song_id: Mapped[int] = mapped_column(
        ForeignKey("songs.id"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    previous_bucket: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    new_bucket: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    previous_position: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    new_position: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    previous_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    new_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    note: Mapped[str | None] = mapped_column(
        String(280),
        nullable=True,
    )
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata",
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
