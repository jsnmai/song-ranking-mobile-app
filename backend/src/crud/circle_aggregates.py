"""Database access for circle-aggregate discovery modules (Most-rated, Trending).

All visibility/block/deleted-user/only_me enforcement is delegated to the shared
`circle_visible_taste_owner_predicate` so these modules share one source of truth with
the rest of the social surfaces. The predicate also excludes the viewer from every
aggregate (`owner_id != viewer_id`), so the viewer can never pad their own circle counts.
"""
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, exists, func, select
from sqlalchemy.orm import Session, aliased

from src.crud.social_access import circle_visible_taste_owner_predicate
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song

# Rating events that represent an actual rating/rerating (i.e. produce a current ranking).
# Deliberately excludes "removed", "reordered", and comparison tombstones
# ("comparison_canceled", "comparison_abandoned"), which are not fresh rating activity.
ELIGIBLE_RATING_EVENT_TYPES = (
    "rated",
    "rerated",
)


@dataclass(frozen=True)
class CircleAggregateRow:
    """One song's circle aggregate: how many visible circle members and their average."""

    song_id: int
    contributor_count: int
    average_score: float
    latest_at: datetime


@dataclass(frozen=True)
class CircleContributorRow:
    """One visible circle member's current ranking, paired with their profile."""

    profile: Profile
    score: float
    bucket: str


def aggregate_circle_most_rated(
    db: Session,
    viewer_id: int,
    *,
    minimum_contributors: int,
    limit: int,
) -> list[CircleAggregateRow]:
    """Return songs ranked by how many visible circle members currently rate them."""
    contributor_count = func.count()
    average_score = func.avg(Ranking.score)
    latest_at = func.max(Ranking.updated_at)
    rows = db.execute(
        select(
            Ranking.song_id,
            contributor_count.label("contributor_count"),
            average_score.label("average_score"),
            latest_at.label("latest_at"),
        )
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
        .group_by(Ranking.song_id)
        .having(contributor_count >= minimum_contributors)
        .order_by(
            contributor_count.desc(),
            average_score.desc(),
            latest_at.desc(),
            Ranking.song_id.asc(),
        )
        .limit(limit)
    ).all()
    return [
        CircleAggregateRow(
            song_id=row.song_id,
            contributor_count=row.contributor_count,
            average_score=float(row.average_score),
            latest_at=row.latest_at,
        )
        for row in rows
    ]


def aggregate_circle_trending(
    db: Session,
    viewer_id: int,
    *,
    window_start: datetime,
    minimum_contributors: int,
    limit: int,
) -> list[CircleAggregateRow]:
    """Return songs ranked by distinct visible circle members who rated them recently.

    Recent activity is sourced from `rating_events` inside the window, then joined back
    to current `rankings`. The join drops members who removed the song (no current
    ranking), and the DISTINCT collapses a member who rerated several times to one.
    """
    recent_activity = (
        select(
            RatingEvent.user_id,
            RatingEvent.song_id,
        )
        .where(RatingEvent.created_at >= window_start)
        .where(RatingEvent.event_type.in_(ELIGIBLE_RATING_EVENT_TYPES))
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                RatingEvent.user_id,
            )
        )
        .distinct()
        .cte("recent_circle_activity")
    )
    contributor_count = func.count()
    average_score = func.avg(Ranking.score)
    latest_at = func.max(Ranking.updated_at)
    rows = db.execute(
        select(
            Ranking.song_id,
            contributor_count.label("contributor_count"),
            average_score.label("average_score"),
            latest_at.label("latest_at"),
        )
        .select_from(recent_activity)
        .join(
            Ranking,
            and_(
                Ranking.user_id == recent_activity.c.user_id,
                Ranking.song_id == recent_activity.c.song_id,
            ),
        )
        .group_by(Ranking.song_id)
        .having(contributor_count >= minimum_contributors)
        .order_by(
            contributor_count.desc(),
            latest_at.desc(),
            average_score.desc(),
            Ranking.song_id.asc(),
        )
        .limit(limit)
    ).all()
    return [
        CircleAggregateRow(
            song_id=row.song_id,
            contributor_count=row.contributor_count,
            average_score=float(row.average_score),
            latest_at=row.latest_at,
        )
        for row in rows
    ]


def list_circle_contributors(
    db: Session,
    viewer_id: int,
    song_ids: list[int],
    *,
    per_song_limit: int,
    window_start: datetime | None = None,
) -> dict[int, list[CircleContributorRow]]:
    """Return the top visible circle contributors per song, highest current score first.

    When `window_start` is given (Trending), contributors are restricted to circle members
    with eligible recent activity, so the chips match the recent cohort the count describes.
    """
    if not song_ids:
        return {}
    statement = (
        select(
            Ranking.song_id,
            Profile,
            Ranking.score,
            Ranking.bucket,
        )
        .join(
            Profile,
            Profile.user_id == Ranking.user_id,
        )
        .where(Ranking.song_id.in_(song_ids))
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
    )
    if window_start is not None:
        recent_event = aliased(RatingEvent)
        statement = statement.where(
            exists(
                select(recent_event.id)
                .where(recent_event.user_id == Ranking.user_id)
                .where(recent_event.song_id == Ranking.song_id)
                .where(recent_event.created_at >= window_start)
                .where(recent_event.event_type.in_(ELIGIBLE_RATING_EVENT_TYPES))
            )
        )
    rows = db.execute(
        statement
        .order_by(
            Ranking.song_id.asc(),
            Ranking.score.desc(),
            Ranking.updated_at.desc(),
        )
    ).all()
    contributors: dict[int, list[CircleContributorRow]] = {}
    for song_id, profile, score, bucket in rows:
        per_song = contributors.setdefault(song_id, [])
        if len(per_song) < per_song_limit:
            per_song.append(
                CircleContributorRow(
                    profile=profile,
                    score=score,
                    bucket=bucket,
                )
            )
    return contributors


def get_viewer_rankings(
    db: Session,
    viewer_id: int,
    song_ids: list[int],
) -> dict[int, Ranking]:
    """Return the viewer's own current rankings for the given songs, keyed by song id."""
    if not song_ids:
        return {}
    rankings = db.execute(
        select(Ranking)
        .where(Ranking.user_id == viewer_id)
        .where(Ranking.song_id.in_(song_ids))
    ).scalars().all()
    return {ranking.song_id: ranking for ranking in rankings}


def get_songs_by_ids(
    db: Session,
    song_ids: list[int],
) -> dict[int, Song]:
    """Return songs for the given ids, keyed by id, for response assembly."""
    if not song_ids:
        return {}
    songs = db.execute(
        select(Song)
        .where(Song.id.in_(song_ids))
    ).scalars().all()
    return {song.id: song for song in songs}
