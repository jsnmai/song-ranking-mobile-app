"""Database queries for Auxstrology axis computation and snapshots."""
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import distinct, extract, func, or_, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.auxstrology_snapshot import AuxstrologySnapshot
from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song


@dataclass
class AuxSongRow:
    """Flat projection of one ranked song used for axis computation."""

    bucket: str
    score: float
    genres_mb: list[str] | None
    genre_deezer: str | None
    artist: str
    release_year: int | None
    global_avg_score: float | None
    global_rating_count: int


@dataclass
class RatingEventStats:
    """Aggregates over a user's rating_events used by behavioral axes."""

    total_events: int
    noted_events: int
    remove_events: int
    move_events: int
    nocturnal_events: int
    active_days: int


@dataclass
class ComparisonStats:
    """Aggregates over a user's comparisons used by behavioral axes."""

    comparison_count: int
    median_duration_ms: float | None
    session_count: int
    mean_depth: float | None


@dataclass
class FirstRating:
    """The user's first intentional rating, used by the First Contact reading."""

    bucket: str | None
    has_note: bool


def get_aux_song_rows(
    db: Session,
    user_id: int,
) -> list[AuxSongRow]:
    """Return all ranked songs for a user with the metadata needed for axes."""
    results = db.execute(
        select(
            Ranking.bucket,
            Ranking.score,
            Song.genres_mb,
            Song.genre_deezer,
            Song.artist,
            Song.release_year,
            Song.global_avg_score,
            Song.global_rating_count,
        )
        .join(Song, Song.id == Ranking.song_id)
        .where(Ranking.user_id == user_id)
    ).all()
    return [
        AuxSongRow(
            bucket=row.bucket,
            score=row.score,
            genres_mb=row.genres_mb,
            genre_deezer=row.genre_deezer,
            artist=row.artist,
            release_year=row.release_year,
            global_avg_score=row.global_avg_score,
            global_rating_count=row.global_rating_count,
        )
        for row in results
    ]


def get_rating_event_stats(
    db: Session,
    user_id: int,
    tz: str | None = None,
) -> RatingEventStats:
    """
    Aggregate rating_events for behavioral axes in one query.

    Nocturnality counts events between 22:00 and 04:59 in the user's profile
    timezone when one is captured (validated IANA key — see ProfileEdit), so a
    9pm Pacific rating never reads as "nocturnal" just because it is 4am UTC.
    Falls back to UTC interpretation when tz is null.
    """
    local_time = (
        func.timezone(tz, RatingEvent.created_at)
        if tz is not None
        else RatingEvent.created_at
    )
    hour = extract("hour", local_time)
    row = db.execute(
        select(
            func.count(RatingEvent.id),
            func.count(RatingEvent.note),
            func.count(RatingEvent.id).filter(RatingEvent.event_type == "removed"),
            func.count(RatingEvent.id).filter(
                RatingEvent.event_type.in_(["rerated", "reordered"])
            ),
            func.count(RatingEvent.id).filter(or_(hour >= 22, hour < 5)),
            func.count(distinct(func.date(local_time))),
        ).where(RatingEvent.user_id == user_id)
    ).one()
    return RatingEventStats(
        total_events=row[0],
        noted_events=row[1],
        remove_events=row[2],
        move_events=row[3],
        nocturnal_events=row[4],
        active_days=row[5],
    )


def get_comparison_stats(
    db: Session,
    user_id: int,
) -> ComparisonStats:
    """Aggregate comparison duration and per-session depth for behavioral axes."""
    duration_row = db.execute(
        select(
            func.count(Comparison.id),
            func.percentile_cont(0.5).within_group(
                Comparison.decision_duration_ms.asc(),
            ),
        ).where(
            Comparison.user_id == user_id,
            Comparison.decision_duration_ms.isnot(None),
        )
    ).one()

    per_session = (
        select(func.count(Comparison.id).label("depth"))
        .where(Comparison.user_id == user_id)
        .group_by(Comparison.session_uuid)
        .subquery()
    )
    depth_row = db.execute(
        select(
            func.count(per_session.c.depth),
            func.avg(per_session.c.depth),
        )
    ).one()

    return ComparisonStats(
        comparison_count=duration_row[0],
        median_duration_ms=float(duration_row[1]) if duration_row[1] is not None else None,
        session_count=depth_row[0],
        mean_depth=float(depth_row[1]) if depth_row[1] is not None else None,
    )


def get_first_rating(
    db: Session,
    user_id: int,
) -> FirstRating:
    """Return the user's first 'rated' event for the First Contact reading."""
    row = db.execute(
        select(
            RatingEvent.new_bucket,
            RatingEvent.note,
        )
        .where(
            RatingEvent.user_id == user_id,
            RatingEvent.event_type == "rated",
        )
        .order_by(
            RatingEvent.created_at.asc(),
            RatingEvent.id.asc(),
        )
        .limit(1)
    ).first()
    if row is None:
        return FirstRating(
            bucket=None,
            has_note=False,
        )
    return FirstRating(
        bucket=row.new_bucket,
        has_note=row.note is not None,
    )


def get_latest_rating_event_at(
    db: Session,
    user_id: int,
) -> datetime | None:
    """Return the timestamp of the user's most recent rating event."""
    return db.execute(
        select(func.max(RatingEvent.created_at)).where(RatingEvent.user_id == user_id)
    ).scalar()


def get_latest_snapshot(
    db: Session,
    user_id: int,
    algorithm_version: str,
) -> AuxstrologySnapshot | None:
    """Return the newest snapshot for a user under the given algorithm version."""
    return db.execute(
        select(AuxstrologySnapshot)
        .where(
            AuxstrologySnapshot.user_id == user_id,
            AuxstrologySnapshot.algorithm_version == algorithm_version,
        )
        .order_by(
            AuxstrologySnapshot.computed_at.desc(),
            AuxstrologySnapshot.id.desc(),
        )
        .limit(1)
    ).scalar_one_or_none()


def insert_snapshot(
    db: Session,
    user_id: int,
    algorithm_version: str,
    status: str,
    sign_key: str | None,
    payload: dict[str, Any],
) -> AuxstrologySnapshot:
    """Append a new snapshot row. Caller commits."""
    snapshot = AuxstrologySnapshot(
        user_id=user_id,
        algorithm_version=algorithm_version,
        status=status,
        sign_key=sign_key,
        payload=payload,
    )
    db.add(snapshot)
    db.flush()
    return snapshot
