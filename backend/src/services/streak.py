"""Weekly-rating streak logic.

A "personal week" is a rolling 7-day window anchored to the local date the
current streak began. The streak advances by one for each consecutive personal
week containing >=1 counted rating (rated/rerated), and breaks when a full
personal week passes with none.

The user_streaks row is a rebuildable cache: every value here is derivable from
rating_events, so retries are idempotent and a dropped update self-heals on the
next rating. The update runs AFTER the rating/comparison commit and is fully
guarded, so a streak failure can never roll back or poison the core rating write.
"""
import logging
from dataclasses import dataclass, replace
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from src.core.config import settings
from src.crud.profile import get_by_user_id
from src.crud.streak import (
    StreakValues,
    get_user_streak,
    list_counted_rating_local_dates,
    upsert_user_streak,
)
from src.pydantic_schemas.streak import StreakState
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.user_streak import UserStreak

logger = logging.getLogger(__name__)

DAYS_PER_WEEK = 7


@dataclass(frozen=True)
class ComputedStreak:
    """Result of a pure streak computation, ready to persist."""

    current_streak: int
    longest_streak: int
    anchor_date: date | None
    last_active_date: date | None


# --- Pure computation (no DB — unit-testable) --------------------------------


def window_index(
    anchor_date: date,
    day: date,
) -> int:
    """Return the 0-based personal-week index of ``day`` relative to the anchor."""
    return (day - anchor_date).days // DAYS_PER_WEEK


def compute_next_streak(
    existing: ComputedStreak,
    event_date: date,
) -> ComputedStreak:
    """Fold one counted rating (on local ``event_date``) into the streak state.

    Keyed on the personal week, never on event count, so replaying the same
    rating is a no-op once its week is recorded.
    """
    if (
        existing.anchor_date is None
        or existing.last_active_date is None
        or existing.current_streak == 0
    ):
        return ComputedStreak(
            current_streak=1,
            longest_streak=max(existing.longest_streak, 1),
            anchor_date=event_date,
            last_active_date=event_date,
        )

    last_window = window_index(existing.anchor_date, existing.last_active_date)
    event_window = window_index(existing.anchor_date, event_date)

    if event_window < last_window:
        # Out-of-order / retried older event — never move the streak backwards.
        return existing
    if event_window == last_window:
        # Same personal week — already counted; only freshen last activity.
        return replace(
            existing,
            last_active_date=max(existing.last_active_date, event_date),
        )
    if event_window == last_window + 1:
        # Next consecutive personal week — the streak grows.
        new_current = existing.current_streak + 1
        return ComputedStreak(
            current_streak=new_current,
            longest_streak=max(existing.longest_streak, new_current),
            anchor_date=existing.anchor_date,
            last_active_date=event_date,
        )
    # A full personal week was skipped — the streak broke; start a fresh one.
    return ComputedStreak(
        current_streak=1,
        longest_streak=max(existing.longest_streak, 1),
        anchor_date=event_date,
        last_active_date=event_date,
    )


def compute_streak_from_event_dates(
    dates: list[date],
) -> ComputedStreak:
    """Rebuild a full streak state from a user's distinct counted rating dates.

    ``dates`` must be ascending and distinct. Used to backfill existing users on
    their first counted rating after the feature ships, and as the reconciliation
    primitive when the cache must be rebuilt from rating_events.
    """
    state = ComputedStreak(
        current_streak=0,
        longest_streak=0,
        anchor_date=None,
        last_active_date=None,
    )
    for day in dates:
        state = compute_next_streak(
            state,
            day,
        )
    return state


def effective_current_streak(
    anchor_date: date,
    last_active_date: date,
    current_streak: int,
    today: date,
) -> int:
    """Decay the stored streak at read time without writing.

    Alive while the most recent activity is in the current personal week or the
    immediately previous one (you still have until this week ends). Once a whole
    personal week is skipped, the displayed streak is 0; longest is untouched.
    """
    gap = window_index(anchor_date, today) - window_index(anchor_date, last_active_date)
    if gap <= 1:
        return current_streak
    return 0


# --- DB-facing helpers -------------------------------------------------------


def record_rating_activity(
    db: Session,
    user_id: int,
) -> None:
    """Update a user's streak after one counted rating commits. Best-effort.

    Runs on the request's session but AFTER the rating/comparison transaction has
    committed, in its own commit, fully guarded: any failure is rolled back and
    logged so it can never surface as a rating failure. Because the streak is
    derivable from rating_events, a skipped update self-heals on the next rating.
    """
    if not settings.streaks_enabled:
        return
    try:
        profile = get_by_user_id(
            db,
            user_id,
        )
        tz = profile.timezone if profile is not None else None
        existing = get_user_streak(
            db,
            user_id,
        )
        if existing is None:
            # First touch since the feature shipped — rebuild from full history,
            # which already includes the rating that just committed.
            computed = compute_streak_from_event_dates(
                list_counted_rating_local_dates(
                    db,
                    user_id,
                    tz,
                )
            )
        else:
            computed = compute_next_streak(
                _computed_from_row(existing),
                _local_today(tz),
            )
        upsert_user_streak(
            db,
            user_id,
            StreakValues(
                current_streak=computed.current_streak,
                longest_streak=computed.longest_streak,
                anchor_date=computed.anchor_date,
                last_active_date=computed.last_active_date,
            ),
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Streak update failed for user_id=%d",
            user_id,
        )


def get_streak_state(
    db: Session,
    profile: Profile,
) -> StreakState:
    """Return a profile's streak for display, decayed to the current moment.

    Visibility is the caller's responsibility — this only runs for viewers who
    may already see the profile's taste data.
    """
    if not settings.streaks_enabled:
        return StreakState()
    row = get_user_streak(
        db,
        profile.user_id,
    )
    if row is None or row.anchor_date is None or row.last_active_date is None:
        return StreakState()
    return StreakState(
        current_streak=effective_current_streak(
            row.anchor_date,
            row.last_active_date,
            row.current_streak,
            _local_today(profile.timezone),
        ),
        longest_streak=row.longest_streak,
    )


def _computed_from_row(
    row: UserStreak,
) -> ComputedStreak:
    """Project a stored streak row into the pure-computation shape."""
    return ComputedStreak(
        current_streak=row.current_streak,
        longest_streak=row.longest_streak,
        anchor_date=row.anchor_date,
        last_active_date=row.last_active_date,
    )


def _local_today(
    tz: str | None,
) -> date:
    """Return today's calendar date in the user's timezone (fallback UTC)."""
    now = datetime.now(timezone.utc)
    if tz is not None:
        try:
            return now.astimezone(ZoneInfo(tz)).date()
        except (ZoneInfoNotFoundError, ValueError):
            return now.date()
    return now.date()
