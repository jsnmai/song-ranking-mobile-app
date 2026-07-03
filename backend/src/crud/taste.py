"""Database queries for taste profile computation."""
from dataclasses import dataclass

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.artist import Artist, SongArtistCredit
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
    song_id: int | None = None
    cover_url: str | None = None
    artist_credits: list[str] | None = None


def get_taste_rows(
    db: Session,
    user_id: int,
) -> list[TasteRow]:
    """Return all ranked songs for a user with the metadata needed for taste computation."""
    results = db.execute(
        select(
            Song.id,
            Ranking.bucket,
            Ranking.score,
            Song.genres_mb,
            Song.genre_deezer,
            Song.artist,
            Song.cover_url,
        )
        .join(Song, Song.id == Ranking.song_id)
        .where(Ranking.user_id == user_id)
        .order_by(
            Ranking.score.desc(),
            Song.id.asc(),
        )
    ).all()
    song_ids = [row.id for row in results]
    credits_by_song = _list_artist_credit_names_by_song(
        db,
        song_ids,
    )
    return [
        TasteRow(
            song_id=row.id,
            bucket=row.bucket,
            score=row.score,
            genres_mb=row.genres_mb,
            genre_deezer=row.genre_deezer,
            artist=row.artist,
            cover_url=row.cover_url,
            artist_credits=credits_by_song.get(row.id),
        )
        for row in results
    ]


def _list_artist_credit_names_by_song(
    db: Session,
    song_ids: list[int],
) -> dict[int, list[str]]:
    """Return structured artist credit names for the ranked songs that have them."""
    if not song_ids:
        return {}
    rows = db.execute(
        select(
            SongArtistCredit.song_id,
            SongArtistCredit.position,
            SongArtistCredit.credited_name,
            Artist.name,
        )
        .join(Artist, Artist.id == SongArtistCredit.artist_id)
        .where(SongArtistCredit.song_id.in_(song_ids))
        .order_by(
            SongArtistCredit.song_id.asc(),
            SongArtistCredit.position.asc(),
            Artist.name.asc(),
        )
    ).all()
    credits_by_song: dict[int, list[str]] = {}
    for row in rows:
        name = row.credited_name or row.name
        if not name:
            continue
        credits_by_song.setdefault(row.song_id, []).append(name)
    return credits_by_song


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
