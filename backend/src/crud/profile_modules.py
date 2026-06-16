from dataclasses import dataclass

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from src.crud.rating import RankingRow
from src.crud.social_access import visible_taste_owner_predicate
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class RatingRow:
    event: RatingEvent
    song: Song


def list_profile_recent_ratings(
    db: Session,
    viewer_id: int,
    owner_id: int,
    limit: int = 5,
) -> list[RatingRow]:
    """Return the latest visible rating event per song for owner_id, newest first."""
    latest_event_ids = (
        select(RatingEvent.id)
        .distinct(RatingEvent.song_id)
        .where(RatingEvent.user_id == owner_id)
        .order_by(
            RatingEvent.song_id,
            RatingEvent.created_at.desc(),
            RatingEvent.id.desc(),
        )
        .subquery()
    )
    rows = db.execute(
        select(RatingEvent, Song)
        .join(latest_event_ids, latest_event_ids.c.id == RatingEvent.id)
        .join(Song, Song.id == RatingEvent.song_id)
        .where(visible_taste_owner_predicate(viewer_id, RatingEvent.user_id))
        .where(RatingEvent.event_type != "removed")
        .where(RatingEvent.event_type != "reordered")
        .where(RatingEvent.new_bucket.is_not(None))
        .where(RatingEvent.new_score.is_not(None))
        .order_by(RatingEvent.created_at.desc(), RatingEvent.id.desc())
        .limit(limit)
    ).all()
    return [RatingRow(event=row[0], song=row[1]) for row in rows]


def list_profile_bucket_rankings(
    db: Session,
    viewer_id: int,
    owner_id: int,
    bucket: str,
) -> list[RankingRow]:
    """Return visible bucket rankings for owner_id ordered by position."""
    rows = db.execute(
        select(Ranking, Song)
        .join(Song, Song.id == Ranking.song_id)
        .where(Ranking.user_id == owner_id)
        .where(Ranking.bucket == bucket)
        .where(visible_taste_owner_predicate(viewer_id, Ranking.user_id))
        .order_by(Ranking.position.asc(), Ranking.id.asc())
    ).all()
    return [RankingRow(ranking=row[0], song=row[1]) for row in rows]


def list_profile_rankings(
    db: Session,
    viewer_id: int,
    owner_id: int,
    limit: int,
    cursor_score: float | None = None,
    cursor_id: int | None = None,
) -> list[RankingRow]:
    """Return visible rankings for owner_id ordered by score descending."""
    statement = (
        select(Ranking, Song)
        .join(Song, Song.id == Ranking.song_id)
        .where(Ranking.user_id == owner_id)
        .where(visible_taste_owner_predicate(viewer_id, Ranking.user_id))
    )
    if cursor_score is not None and cursor_id is not None:
        statement = statement.where(
            or_(
                Ranking.score < cursor_score,
                and_(Ranking.score == cursor_score, Ranking.id > cursor_id),
            )
        )
    rows = db.execute(
        statement.order_by(Ranking.score.desc(), Ranking.id.asc()).limit(limit)
    ).all()
    return [RankingRow(ranking=row[0], song=row[1]) for row in rows]
