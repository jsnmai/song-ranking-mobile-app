# SQLAlchemy model for the `user_streaks` table.
# One row per user — a rebuildable cache of their weekly rating streak, derived
# from rating_events (the source of truth). All reads/writes go through
# src/crud/streak.py; no business logic lives here.
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, func, text
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class UserStreak(Base):
    """
    One user's weekly-rating streak bookkeeping.

    A "personal week" is a rolling 7-day window anchored to ``anchor_date`` — the
    local date the current streak began. The streak advances by one for each
    consecutive personal week that contains >=1 counted rating, and breaks when a
    whole personal week passes with none. Stored dates are already converted to
    the user's local timezone, so past bucketing stays frozen even if the profile
    timezone later changes. Every value here is recomputable from rating_events,
    so a lost update self-heals on the next rating.
    """

    __tablename__ = "user_streaks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,  # one streak row per user
        nullable=False,
    )
    current_streak: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    longest_streak: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    # Local date the current streak began — the anchor of the rolling 7-day windows.
    anchor_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )
    # Local date of the most recent counted rating (rated/rerated).
    last_active_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
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
