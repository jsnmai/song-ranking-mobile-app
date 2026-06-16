"""Database access for likes on activity cards (rating events)."""
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.like import Like
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.rating_event import RatingEvent


def get_likeable_event(
    db: Session,
    rating_event_id: int,
) -> RatingEvent | None:
    """Return the rating event only if it is a likeable activity card (a verdict).

    Removed/reordered events and rows without a bucket/score have no activity card, so
    they cannot be liked.
    """
    return db.execute(
        select(RatingEvent)
        .where(RatingEvent.id == rating_event_id)
        .where(RatingEvent.event_type.in_(("rated", "rerated")))
        .where(RatingEvent.new_bucket.is_not(None))
        .where(RatingEvent.new_score.is_not(None))
    ).scalar_one_or_none()


def create_like(
    db: Session,
    user_id: int,
    rating_event_id: int,
) -> None:
    """Idempotently record a like (duplicate likes are a no-op)."""
    db.execute(
        pg_insert(Like)
        .values(
            user_id=user_id,
            rating_event_id=rating_event_id,
        )
        .on_conflict_do_nothing(
            index_elements=["user_id", "rating_event_id"],
        )
    )


def delete_like(
    db: Session,
    user_id: int,
    rating_event_id: int,
) -> None:
    """Remove a user's like (idempotent)."""
    db.execute(
        delete(Like)
        .where(Like.user_id == user_id)
        .where(Like.rating_event_id == rating_event_id)
    )


def count_likes(
    db: Session,
    rating_event_id: int,
) -> int:
    """Return how many users liked the activity."""
    return db.scalar(
        select(func.count())
        .select_from(Like)
        .where(Like.rating_event_id == rating_event_id)
    )


def has_liked(
    db: Session,
    user_id: int,
    rating_event_id: int,
) -> bool:
    """Return whether the user has liked the activity."""
    return db.scalar(
        select(func.count())
        .select_from(Like)
        .where(Like.user_id == user_id)
        .where(Like.rating_event_id == rating_event_id)
    ) > 0


def count_likes_for_events(
    db: Session,
    rating_event_ids: list[int],
) -> dict[int, int]:
    """Return {rating_event_id: like_count} for the given events (missing = 0 likes)."""
    if not rating_event_ids:
        return {}
    rows = db.execute(
        select(Like.rating_event_id, func.count())
        .where(Like.rating_event_id.in_(rating_event_ids))
        .group_by(Like.rating_event_id)
    ).all()
    return {event_id: count for event_id, count in rows}


def liked_event_ids(
    db: Session,
    user_id: int,
    rating_event_ids: list[int],
) -> set[int]:
    """Return the subset of the given events that the user has liked."""
    if not rating_event_ids:
        return set()
    return set(
        db.execute(
            select(Like.rating_event_id)
            .where(Like.user_id == user_id)
            .where(Like.rating_event_id.in_(rating_event_ids))
        ).scalars()
    )


def list_liker_profiles(
    db: Session,
    rating_event_id: int,
) -> list[Profile]:
    """Return profiles of users who liked the activity, most recent like first."""
    return list(
        db.execute(
            select(Profile)
            .join(Like, Like.user_id == Profile.user_id)
            .where(Like.rating_event_id == rating_event_id)
            .order_by(Like.created_at.desc())
        ).scalars()
    )


def delete_likes_for_user(
    db: Session,
    user_id: int,
) -> None:
    """Remove every like authored by the user (used by account deletion)."""
    db.execute(
        delete(Like)
        .where(Like.user_id == user_id)
    )
