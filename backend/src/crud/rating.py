# Database access layer for rankings and rating_events.
# Services own scoring decisions; this module owns all SQLAlchemy reads/writes.
from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class RankingWithSong:
    """A current ranking row paired with its song metadata."""

    ranking: Ranking
    song: Song


def get_user_ranking_by_song(
    db: Session,
    user_id: int,
    song_id: int,
) -> Ranking | None:
    """Return a user's current ranking for one song, or None."""
    return db.execute(
        select(Ranking)
        .where(Ranking.user_id == user_id)
        .where(Ranking.song_id == song_id)
    ).scalar_one_or_none()


def list_user_bucket_rankings(
    db: Session,
    user_id: int,
    bucket: str,
) -> list[Ranking]:
    """Return one user's rankings in a bucket ordered by position."""
    return list(
        db.execute(
            select(Ranking)
            .where(Ranking.user_id == user_id)
            .where(Ranking.bucket == bucket)
            .order_by(
                Ranking.position.asc(),
                Ranking.id.asc(),
            )
        ).scalars()
    )


def list_all_user_rankings_with_songs(
    db: Session,
    user_id: int,
) -> list[RankingWithSong]:
    """Return all current rankings for one user with song metadata."""
    rows = db.execute(
        select(
            Ranking,
            Song,
        )
        .join(
            Song,
            Song.id == Ranking.song_id,
        )
        .where(Ranking.user_id == user_id)
        .order_by(
            Ranking.score.desc(),
            Ranking.id.asc(),
        )
    ).all()
    return [
        RankingWithSong(
            ranking=row[0],
            song=row[1],
        )
        for row in rows
    ]


def list_user_rankings_with_songs(
    db: Session,
    user_id: int,
    limit: int,
    cursor_score: float | None = None,
    cursor_id: int | None = None,
) -> list[RankingWithSong]:
    """Return current rankings with songs using score/id cursor pagination."""
    statement = (
        select(
            Ranking,
            Song,
        )
        .join(
            Song,
            Song.id == Ranking.song_id,
        )
        .where(Ranking.user_id == user_id)
    )
    if cursor_score is not None and cursor_id is not None:
        statement = statement.where(
            or_(
                Ranking.score < cursor_score,
                and_(
                    Ranking.score == cursor_score,
                    Ranking.id > cursor_id,
                ),
            )
        )

    rows = db.execute(
        statement
        .order_by(
            Ranking.score.desc(),
            Ranking.id.asc(),
        )
        .limit(limit)
    ).all()
    return [
        RankingWithSong(
            ranking=row[0],
            song=row[1],
        )
        for row in rows
    ]


def create_ranking(
    db: Session,
    user_id: int,
    song_id: int,
    bucket: str,
    position: int,
    score: float,
) -> Ranking:
    """Create a current ranking row without committing."""
    ranking = Ranking(
        user_id=user_id,
        song_id=song_id,
        bucket=bucket,
        position=position,
        score=score,
    )
    db.add(ranking)
    db.flush()
    return ranking


def apply_ranking_state(
    ranking: Ranking,
    bucket: str,
    position: int,
    score: float,
) -> None:
    """Apply calculated state to a ranking row without committing."""
    ranking.bucket = bucket
    ranking.position = position
    ranking.score = score


def delete_ranking(
    db: Session,
    ranking: Ranking,
) -> None:
    """Delete a current ranking row without committing."""
    db.delete(ranking)
    db.flush()


def create_rating_event(
    db: Session,
    user_id: int,
    song_id: int,
    event_type: str,
    previous_bucket: str | None,
    new_bucket: str | None,
    previous_position: int | None,
    new_position: int | None,
    previous_score: float | None,
    new_score: float | None,
    note: str | None,
    metadata: dict[str, Any] | None = None,
) -> RatingEvent:
    """Create an append-only rating event without committing."""
    event = RatingEvent(
        user_id=user_id,
        song_id=song_id,
        event_type=event_type,
        previous_bucket=previous_bucket,
        new_bucket=new_bucket,
        previous_position=previous_position,
        new_position=new_position,
        previous_score=previous_score,
        new_score=new_score,
        note=note,
        metadata_=metadata,
    )
    db.add(event)
    db.flush()
    return event


def commit_changes(
    db: Session,
) -> None:
    """Commit pending ranking/rating-event changes."""
    db.commit()


def refresh_ranking_event_pair(
    db: Session,
    ranking: Ranking,
    event: RatingEvent,
) -> None:
    """Refresh objects returned by a finalized rating response."""
    db.refresh(ranking)
    db.refresh(event)


def refresh_rating_event(
    db: Session,
    event: RatingEvent,
) -> None:
    """Refresh a rating event returned after removal."""
    db.refresh(event)


def refresh_rating_events(
    db: Session,
    events: list[RatingEvent],
) -> None:
    """Refresh rating events returned after a multi-row write."""
    for event in events:
        db.refresh(event)
