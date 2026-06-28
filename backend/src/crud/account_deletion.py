"""Database helpers for account deletion."""

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.block import Block
from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.comparison_session import ComparisonSession
from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.like import Like
from src.sqlalchemy_tables.notification import Notification
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.bookmark import Bookmark
from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot
from src.sqlalchemy_tables.user_streak import UserStreak


def list_ranked_song_ids_for_user(
    db: Session,
    user_id: int,
) -> set[int]:
    """Return song IDs whose aggregates need recalculation after user deletion."""
    return set(
        db.execute(
            select(Ranking.song_id)
            .where(Ranking.user_id == user_id)
        ).scalars()
    )


def delete_similarity_snapshots_for_user(
    db: Session,
    user_id: int,
) -> None:
    """Remove compatibility snapshots involving the deleted user."""
    db.execute(
        delete(UserSimilaritySnapshot)
        .where(
            or_(
                UserSimilaritySnapshot.user_a_id == user_id,
                UserSimilaritySnapshot.user_b_id == user_id,
            )
        )
    )


def delete_taste_history_for_user(
    db: Session,
    user_id: int,
) -> None:
    """Remove row-level likes, streaks, Bookmarks, rankings, rating events, comparisons, and sessions.

    Likes the user authored are removed here; likes *on* the user's events are cleared by the
    rating_events delete below (FK ondelete=CASCADE). The streak row is a per-user cache and is
    dropped outright.
    """
    db.execute(
        delete(Like)
        .where(Like.user_id == user_id)
    )
    db.execute(
        delete(UserStreak)
        .where(UserStreak.user_id == user_id)
    )
    db.execute(
        delete(Bookmark)
        .where(Bookmark.user_id == user_id)
    )
    db.execute(
        delete(ComparisonSession)
        .where(ComparisonSession.user_id == user_id)
    )
    db.execute(
        delete(Comparison)
        .where(Comparison.user_id == user_id)
    )
    db.execute(
        delete(RatingEvent)
        .where(RatingEvent.user_id == user_id)
    )
    db.execute(
        delete(Ranking)
        .where(Ranking.user_id == user_id)
    )


def delete_social_rows_for_user(
    db: Session,
    user_id: int,
) -> None:
    """Remove follows, blocks, and notifications in either direction for the deleted user."""
    db.execute(
        delete(Notification)
        .where(
            or_(
                Notification.recipient_id == user_id,
                Notification.actor_id == user_id,
            )
        )
    )
    db.execute(
        delete(Follow)
        .where(
            or_(
                Follow.follower_id == user_id,
                Follow.following_id == user_id,
            )
        )
    )
    db.execute(
        delete(Block)
        .where(
            or_(
                Block.blocker_id == user_id,
                Block.blocked_id == user_id,
            )
        )
    )


def delete_profile_for_user(
    db: Session,
    user_id: int,
) -> None:
    """Remove the profile shell and username for the deleted user."""
    db.execute(
        delete(Profile)
        .where(Profile.user_id == user_id)
    )
