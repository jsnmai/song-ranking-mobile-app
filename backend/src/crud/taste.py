"""Database queries for taste profile computation."""
from dataclasses import dataclass

from sqlalchemy import select
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
