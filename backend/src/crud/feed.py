# Database access layer for the social feed.
# Fan-out-on-read: query rating_events from the viewer and the visible users they follow.
# Visibility/block/deleted-user enforcement is delegated to the shared social-access predicate
# so the feed shares one privacy implementation with Profile, Discover, and the circle modules.
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from src.crud.social_access import followed_visible_taste_owner_predicate
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
    """Return feed events from the current user and the visible users they follow.

    The followed-user branch delegates taste visibility, mutual-follow access for
    friends-only profiles, blocks in both directions, and deleted-user exclusion to the
    shared `followed_visible_taste_owner_predicate`, so the feed no longer reimplements
    that privacy logic inline. Own events are always shown (a private viewer still sees
    their own activity).
    """
    latest_event_ids = (
        select(RatingEvent.id)
        .distinct(
            RatingEvent.user_id,
            RatingEvent.song_id,
        )
        .order_by(
            RatingEvent.user_id,
            RatingEvent.song_id,
            RatingEvent.created_at.desc(),
            RatingEvent.id.desc(),
        )
        .subquery()
    )
    statement = (
        select(
            RatingEvent,
            Profile,
            Song,
        )
        .join(
            latest_event_ids,
            latest_event_ids.c.id == RatingEvent.id,
        )
        .join(
            Profile,
            Profile.user_id == RatingEvent.user_id,
        )
        .join(
            Song,
            Song.id == RatingEvent.song_id,
        )
        .where(
            or_(
                # Own events are always visible.
                RatingEvent.user_id == user_id,
                # Followed-user events: visibility, friends-only mutual access, blocks (both
                # directions), and deleted-user exclusion are all enforced by the shared predicate.
                followed_visible_taste_owner_predicate(
                    user_id,
                    RatingEvent.user_id,
                ),
            )
        )
        .where(RatingEvent.event_type != "removed")
        .where(RatingEvent.event_type != "reordered")
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
