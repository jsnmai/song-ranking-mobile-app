"""Database queries for taste profile computation."""
from dataclasses import dataclass

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song


@dataclass
class TasteRow:
    """Flat projection of one ranked song used for taste computation."""

    bucket: str
    score: float
    genres_mb: list[str] | None
    genre_deezer: str | None
    artist: str


def get_taste_rows(
    db: Session,
    user_id: int,
) -> list[TasteRow]:
    """Return all ranked songs for a user with the metadata needed for taste computation."""
    results = db.execute(
        select(
            Ranking.bucket,
            Ranking.score,
            Song.genres_mb,
            Song.genre_deezer,
            Song.artist,
        )
        .join(Song, Song.id == Ranking.song_id)
        .where(Ranking.user_id == user_id)
    ).all()
    return [
        TasteRow(
            bucket=row.bucket,
            score=row.score,
            genres_mb=row.genres_mb,
            genre_deezer=row.genre_deezer,
            artist=row.artist,
        )
        for row in results
    ]


def get_population_like_shares(
    db: Session,
    min_ratings: int,
    exclude_user_id: int,
) -> list[float]:
    """Return each other user's like-share (likes / total ranked) for the harshness percentile.

    Only users with at least `min_ratings` ranked songs are included, so a stray
    one-song account can't skew the distribution, and the requesting user is
    excluded so they aren't compared against themselves.
    """
    likes = func.sum(case((Ranking.bucket == "like", 1), else_=0))
    total = func.count()
    rows = db.execute(
        select(total.label("total"), likes.label("likes"))
        .where(Ranking.user_id != exclude_user_id)
        .group_by(Ranking.user_id)
        .having(total >= min_ratings)
    ).all()
    return [float(row.likes) / row.total for row in rows if row.total > 0]
