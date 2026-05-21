# Database access layer for the social feed.
# Phase 9b uses fan-out-on-read: query rating_events from followed users.
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class FeedEventRow:
    """A rating event paired with actor profile and song metadata."""

    event: RatingEvent
    actor_profile: Profile
    song: Song


def list_feed_events(
    db: Session,
    user_id: int,
    limit: int,
    cursor_created_at: datetime | None = None,
    cursor_id: int | None = None,
) -> list[FeedEventRow]:
    """Return feed events from users followed by the current user."""
    statement = (
        select(
            RatingEvent,
            Profile,
            Song,
        )
        .join(
            Follow,
            Follow.following_id == RatingEvent.user_id,
        )
        .join(
            Profile,
            Profile.user_id == RatingEvent.user_id,
        )
        .join(
            Song,
            Song.id == RatingEvent.song_id,
        )
        .where(Follow.follower_id == user_id)
        .where(Profile.is_public.is_(True))
        .where(RatingEvent.new_bucket.is_not(None))
        .where(RatingEvent.new_score.is_not(None))
    )
    if cursor_created_at is not None and cursor_id is not None:
        statement = statement.where(
            or_(
                RatingEvent.created_at < cursor_created_at,
                and_(
                    RatingEvent.created_at == cursor_created_at,
                    RatingEvent.id < cursor_id,
                ),
            )
        )

    rows = db.execute(
        statement
        .order_by(
            RatingEvent.created_at.desc(),
            RatingEvent.id.desc(),
        )
        .limit(limit)
    ).all()
    return [
        FeedEventRow(
            event=row[0],
            actor_profile=row[1],
            song=row[2],
        )
        for row in rows
    ]
