"""Database access layer for the user_streaks table.

The streak row is a rebuildable cache of values derived from rating_events; this
module owns all SQL for reading/writing it and for deriving local rating dates.
Callers commit.
"""
from dataclasses import dataclass
from datetime import date

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.user_streak import UserStreak

# A personal week stays alive on intentional rating actions only — not removes or
# reorders. rerated counts: re-rating a song is real weekly engagement.
COUNTED_EVENT_TYPES = ("rated", "rerated")


@dataclass(frozen=True)
class StreakValues:
    """Plain streak field values for a single upsert (no DB identity)."""

    current_streak: int
    longest_streak: int
    anchor_date: date | None
    last_active_date: date | None


def get_user_streak(
    db: Session,
    user_id: int,
) -> UserStreak | None:
    """Return the user's streak row, or None if they have never had one."""
    return db.execute(
        select(UserStreak)
        .where(UserStreak.user_id == user_id)
    ).scalar_one_or_none()


def upsert_user_streak(
    db: Session,
    user_id: int,
    values: StreakValues,
) -> UserStreak:
    """Insert or update the user's single streak row. Caller commits."""
    row = get_user_streak(
        db,
        user_id,
    )
    if row is None:
        row = UserStreak(user_id=user_id)
        db.add(row)
    row.current_streak = values.current_streak
    row.longest_streak = values.longest_streak
    row.anchor_date = values.anchor_date
    row.last_active_date = values.last_active_date
    db.flush()
    return row


def list_counted_rating_local_dates(
    db: Session,
    user_id: int,
    tz: str | None,
) -> list[date]:
    """Return the distinct local dates on which the user made a counted rating.

    Local dates are computed in the user's profile timezone (fallback UTC), the
    same tz-aware pattern used for Auxstrology active-days, so window boundaries
    match the user's own clock. Ascending order lets the streak fold replay
    chronologically.
    """
    local_date = _local_date_expr(tz)
    return list(
        db.execute(
            select(local_date)
            .where(
                RatingEvent.user_id == user_id,
                RatingEvent.event_type.in_(COUNTED_EVENT_TYPES),
            )
            .distinct()
            .order_by(local_date.asc())
        ).scalars()
    )


def count_distinct_songs_in_window(
    db: Session,
    user_id: int,
    tz: str | None,
    window_start: date,
    window_end: date,
) -> int:
    """Count distinct songs the user rated within an inclusive local-date window.

    Distinct songs, not events: re-rating the same song in the window keeps the
    streak alive but is never counted twice here.
    """
    local_date = _local_date_expr(tz)
    return db.execute(
        select(func.count(distinct(RatingEvent.song_id)))
        .where(
            RatingEvent.user_id == user_id,
            RatingEvent.event_type.in_(COUNTED_EVENT_TYPES),
            local_date >= window_start,
            local_date <= window_end,
        )
    ).scalar_one()


def _local_date_expr(tz: str | None):
    """SQL expression for a rating event's local calendar date."""
    local_time = (
        func.timezone(tz, RatingEvent.created_at)
        if tz is not None
        else RatingEvent.created_at
    )
    return func.date(local_time)
