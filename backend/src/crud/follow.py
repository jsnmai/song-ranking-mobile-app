# Database access layer for follows.
# All SQL queries for social follow relationships live here.
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.profile import Profile


def get_follow(
    db: Session,
    follower_id: int,
    following_id: int,
) -> Follow | None:
    """Return the follow row for follower -> following, or None."""
    return db.execute(
        select(Follow)
        .where(Follow.follower_id == follower_id)
        .where(Follow.following_id == following_id)
    ).scalar_one_or_none()


def create_follow(
    db: Session,
    follower_id: int,
    following_id: int,
) -> Follow:
    """Stage a new follow row and return the flushed instance."""
    follow = Follow(
        follower_id=follower_id,
        following_id=following_id,
    )
    db.add(follow)
    db.flush()
    return follow


def delete_follow(
    db: Session,
    follow: Follow,
) -> None:
    """Stage a follow row for deletion."""
    db.delete(follow)
    db.flush()


def count_followers(
    db: Session,
    user_id: int,
) -> int:
    """Return how many users follow this user."""
    return db.execute(
        select(func.count())
        .select_from(Follow)
        .where(Follow.following_id == user_id)
    ).scalar_one()


def count_following(
    db: Session,
    user_id: int,
) -> int:
    """Return how many users this user follows."""
    return db.execute(
        select(func.count())
        .select_from(Follow)
        .where(Follow.follower_id == user_id)
    ).scalar_one()


def list_followers(
    db: Session,
    user_id: int,
) -> list[Profile]:
    """Return profiles for users who follow this user, newest follow first."""
    return list(
        db.execute(
            select(Profile)
            .join(Follow, Follow.follower_id == Profile.user_id)
            .where(Follow.following_id == user_id)
            .order_by(Follow.created_at.desc(), Follow.id.desc())
        ).scalars()
    )


def list_following(
    db: Session,
    user_id: int,
) -> list[Profile]:
    """Return profiles this user follows, newest follow first."""
    return list(
        db.execute(
            select(Profile)
            .join(Follow, Follow.following_id == Profile.user_id)
            .where(Follow.follower_id == user_id)
            .order_by(Follow.created_at.desc(), Follow.id.desc())
        ).scalars()
    )
