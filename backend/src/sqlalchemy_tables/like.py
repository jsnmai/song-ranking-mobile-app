# SQLAlchemy model for likes on activity cards.
# A like is on one activity card = one `rating_events` row (a rate/rerate verdict).
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Like(Base):
    """One user's like on one activity card (rating event). Self-likes are allowed."""

    __tablename__ = "likes"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "rating_event_id",
            name="uq_likes_user_event",
        ),
        Index(
            "ix_likes_rating_event_id",
            "rating_event_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating_event_id: Mapped[int] = mapped_column(
        ForeignKey("rating_events.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
