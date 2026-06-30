"""Database access for the global "Popular on LISTn" module.

This is the platform-wide counterpart to the circle aggregates. It deliberately has NO
visibility/block/only_me predicate and does NOT exclude any viewer: global popularity is an
anonymous, viewer-independent statistic (the same rule that lets `songs.global_*` aggregate
every user's ratings). The weekly query mirrors `aggregate_circle_trending` with the circle
predicate removed; the all-time query is the sparse-week backfill.
"""
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from src.crud.circle_aggregates import ELIGIBLE_RATING_EVENT_TYPES
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class PopularRow:
    """One song's weekly popularity: how many distinct users rated it in the window."""

    song_id: int
    rating_count: int
    latest_at: datetime


def aggregate_popular_this_week(
    db: Session,
    *,
    window_start: datetime,
    minimum_raters: int,
    limit: int,
) -> list[PopularRow]:
    """Return songs ranked by distinct users who rated them in the recent window.

    Recent activity comes from `rating_events` inside the window, then joins back to current
    `rankings` so a song someone has since removed drops out. The DISTINCT collapses a user who
    rerated a song several times to a single rater. No visibility predicate: this counts the
    whole user base.
    """
    recent_activity = (
        select(
            RatingEvent.user_id,
            RatingEvent.song_id,
        )
        .where(RatingEvent.created_at >= window_start)
        .where(RatingEvent.event_type.in_(ELIGIBLE_RATING_EVENT_TYPES))
        .distinct()
        .cte("recent_global_activity")
    )
    rating_count = func.count()
    average_score = func.avg(Ranking.score)
    latest_at = func.max(Ranking.updated_at)
    rows = db.execute(
        select(
            Ranking.song_id,
            rating_count.label("rating_count"),
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
        .having(rating_count >= minimum_raters)
        .order_by(
            rating_count.desc(),
            latest_at.desc(),
            average_score.desc(),
            Ranking.song_id.asc(),
        )
        .limit(limit)
    ).all()
    return [
        PopularRow(
            song_id=row.song_id,
            rating_count=row.rating_count,
            latest_at=row.latest_at,
        )
        for row in rows
    ]


def all_time_most_rated(
    db: Session,
    *,
    minimum_ratings: int,
    limit: int,
) -> list[Song]:
    """Return the all-time most-rated songs, for the sparse-week backfill.

    Reads the O(1) `songs.global_rating_count` aggregate (maintained on the rating write path),
    so this needs no GROUP BY. Deterministic tie-break keeps the row stable across refetches.
    """
    return list(
        db.execute(
            select(Song)
            .where(Song.global_rating_count >= minimum_ratings)
            .order_by(
                Song.global_rating_count.desc(),
                Song.global_avg_score.desc().nullslast(),
                Song.id.asc(),
            )
            .limit(limit)
        ).scalars().all()
    )
