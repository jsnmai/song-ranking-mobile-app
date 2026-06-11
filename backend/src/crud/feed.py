# Database access layer for the social feed.
# Phase 9b uses fan-out-on-read: query rating_events from followed users.
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, aliased

from src.sqlalchemy_tables.block import Block
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
    """Return feed events from the current user and users they follow."""
    mutual_follow = aliased(Follow)
    viewer_blocks_actor = aliased(Block)
    actor_blocks_viewer = aliased(Block)
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
        .outerjoin(
            Follow,
            and_(
                Follow.following_id == RatingEvent.user_id,
                Follow.follower_id == user_id,
            ),
        )
        .outerjoin(
            mutual_follow,
            and_(
                mutual_follow.follower_id == RatingEvent.user_id,
                mutual_follow.following_id == user_id,
            ),
        )
        .outerjoin(
            viewer_blocks_actor,
            and_(
                viewer_blocks_actor.blocker_id == user_id,
                viewer_blocks_actor.blocked_id == RatingEvent.user_id,
            ),
        )
        .outerjoin(
            actor_blocks_viewer,
            and_(
                actor_blocks_viewer.blocker_id == RatingEvent.user_id,
                actor_blocks_viewer.blocked_id == user_id,
            ),
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
                # Followed-user events are subject to visibility and block checks.
                and_(
                    Follow.id.is_not(None),
                    or_(
                        Profile.visibility == "public",
                        and_(
                            Profile.visibility == "friends_only",
                            mutual_follow.id.is_not(None),
                        ),
                    ),
                    viewer_blocks_actor.id.is_(None),
                    actor_blocks_viewer.id.is_(None),
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
