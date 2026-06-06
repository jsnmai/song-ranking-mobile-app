"""SQLAlchemy model for private current-user Saved Songs."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class SavedSong(Base):
    """One user-controlled saved song."""

    __tablename__ = "saved_songs"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "song_id",
            name="uq_saved_songs_user_song",
        ),
        Index(
            "ix_saved_songs_user_created_at",
            "user_id",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    song_id: Mapped[int] = mapped_column(
        ForeignKey("songs.id"),
        nullable=False,
    )
    source: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
