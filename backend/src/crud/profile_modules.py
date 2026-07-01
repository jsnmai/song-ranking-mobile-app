from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from src.crud.rating import RankingRow
from src.crud.social_access import visible_taste_owner_predicate
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
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
    *,
    cursor_created_at: datetime | None = None,
    cursor_id: int | None = None,
) -> list[RatingRow]:
    """Return the latest visible rating event per song for owner_id, newest first.

    When a (created_at, id) cursor is supplied, only events strictly older than the cursor are
    returned — descending keyset pagination for the full activity list.
    """
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
    statement = (
        select(RatingEvent, Song)
        .join(latest_event_ids, latest_event_ids.c.id == RatingEvent.id)
        .join(Song, Song.id == RatingEvent.song_id)
        .where(visible_taste_owner_predicate(viewer_id, RatingEvent.user_id))
        .where(RatingEvent.event_type != "removed")
        .where(RatingEvent.event_type != "reordered")
        .where(RatingEvent.new_bucket.is_not(None))
        .where(RatingEvent.new_score.is_not(None))
    )
    if cursor_created_at is not None and cursor_id is not None:
        statement = statement.where(
            or_(
                RatingEvent.created_at < cursor_created_at,
                and_(
                    RatingEvent.created_at == cursor_created_at,
                    RatingEvent.id < cursor_id,
                ),
            )
        )
    rows = db.execute(
        statement
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
    *,
    bucket: str | None = None,
    artist: str | None = None,
    album: str | None = None,
    album_artist: str | None = None,
) -> list[RankingRow]:
    """Return visible rankings for owner_id ordered by score descending.

    Optional bucket/artist/album filters are applied server-side so the viewer paginates
    the filtered set directly (the screen never holds the full list). ``album`` pairs with
    ``album_artist`` because the same album title can appear under different artists.
    """
    statement = (
        select(Ranking, Song)
        .join(Song, Song.id == Ranking.song_id)
        .where(Ranking.user_id == owner_id)
        .where(visible_taste_owner_predicate(viewer_id, Ranking.user_id))
    )
    if bucket is not None:
        statement = statement.where(Ranking.bucket == bucket)
    if artist is not None:
        statement = statement.where(Song.artist == artist)
    if album is not None:
        statement = statement.where(Song.album == album)
        if album_artist is not None:
            statement = statement.where(Song.artist == album_artist)
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


@dataclass(frozen=True)
class RankingFacets:
    """Aggregate counts used to populate the rankings filter UI without loading the full list."""

    bucket_counts: dict[str, int]
    artists: list[tuple[str, int]]
    albums: list[tuple[str, str, int]]


def profile_ranking_facets(
    db: Session,
    viewer_id: int,
    owner_id: int,
) -> RankingFacets:
    """Return per-bucket counts and the distinct artists/albums in owner_id's visible rankings.

    All three aggregates honour the same taste-visibility predicate as the list query, so the
    filter chips never reveal songs the viewer couldn't otherwise see.
    """
    visible = visible_taste_owner_predicate(viewer_id, Ranking.user_id)

    bucket_rows = db.execute(
        select(Ranking.bucket, func.count())
        .where(Ranking.user_id == owner_id)
        .where(visible)
        .group_by(Ranking.bucket)
    ).all()

    artist_rows = db.execute(
        select(Song.artist, func.count())
        .select_from(Ranking)
        .join(Song, Song.id == Ranking.song_id)
        .where(Ranking.user_id == owner_id)
        .where(visible)
        .group_by(Song.artist)
        .order_by(Song.artist.asc())
    ).all()

    album_rows = db.execute(
        select(Song.album, Song.artist, func.count())
        .select_from(Ranking)
        .join(Song, Song.id == Ranking.song_id)
        .where(Ranking.user_id == owner_id)
        .where(visible)
        .where(Song.album.is_not(None))
        .where(Song.album != "")
        .group_by(Song.album, Song.artist)
    ).all()

    return RankingFacets(
        bucket_counts={bucket: count for bucket, count in bucket_rows},
        artists=[(artist, count) for artist, count in artist_rows],
        albums=[(album, artist, count) for album, artist, count in album_rows],
    )
