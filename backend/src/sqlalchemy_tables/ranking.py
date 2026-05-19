# SQLAlchemy model for the `rankings` table.
# Stores each user's current ranking state for songs they have rated.
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Ranking(Base):
    """
    Current per-user song ranking state.

    `rating_events` stores history; this table stores only the latest bucket,
    position, and score used by current app screens.
    """

    __tablename__ = "rankings"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "song_id",
            name="uq_rankings_user_song",
        ),
        Index(
            "ix_rankings_user_bucket_position",
            "user_id",
            "bucket",
            "position",
        ),
        Index(
            "ix_rankings_user_score_id",
            "user_id",
            "score",
            "id",
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
    bucket: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    score: Mapped[float] = mapped_column(
        Float,
        nullable=False,
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
