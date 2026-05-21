# Database access layer for the songs table.
# Durable song rows are created only after user action, never during search.
import re
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from src.pydantic_schemas.song import SongCreate
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song


def parse_preview_url_expires_at(preview_url: str | None) -> datetime | None:
    """Extract the Akamai exp= Unix timestamp from a Deezer preview URL and return as UTC datetime."""
    if not preview_url:
        return None
    match = re.search(r"exp=(\d+)", preview_url)
    if match is None:
        return None
    return datetime.fromtimestamp(int(match.group(1)), tz=timezone.utc)


def get_by_id(
    db: Session,
    song_id: int,
) -> Song | None:
    """Return the Song with this primary key, or None if not found."""
    return db.execute(
        select(Song)
        .where(Song.id == song_id)
    ).scalar_one_or_none()


def get_by_deezer_id(
    db: Session,
    deezer_id: int,
) -> Song | None:
    """Return the Song with this Deezer ID, or None if not found."""
    return db.execute(
        select(Song)
        .where(Song.deezer_id == deezer_id)
    ).scalar_one_or_none()


def upsert_from_deezer(
    db: Session,
    data: SongCreate,
) -> Song:
    """
    Insert Deezer metadata for a user-touched song, or return the existing row.

    PostgreSQL handles the conflict atomically so two users touching the same
    song at the same time do not create duplicates. The preview_url_expires_at
    is parsed from the preview URL's Akamai exp= token at insert time.
    """
    expires_at = parse_preview_url_expires_at(data.preview_url)
    values = {**data.model_dump(), "preview_url_expires_at": expires_at}
    statement = (
        insert(Song)
        .values(**values)
        .on_conflict_do_nothing(index_elements=["deezer_id"])
        .returning(Song.id)
    )
    song_id = db.execute(statement).scalar_one_or_none()

    if song_id is not None:
        inserted_song = get_by_id(
            db,
            song_id,
        )
        if inserted_song is not None:
            return inserted_song

    existing_song = get_by_deezer_id(
        db,
        data.deezer_id,
    )
    if existing_song is None:
        raise RuntimeError("Song upsert failed without returning or finding a row.")
    return existing_song


def update_preview_url(
    db: Session,
    song: Song,
    preview_url: str | None,
    expires_at: datetime | None,
) -> Song:
    """Store a refreshed Deezer preview URL and its parsed expiry without committing."""
    song.preview_url = preview_url
    song.preview_url_expires_at = expires_at
    return song


def recompute_song_aggregates(
    db: Session,
    song_id: int,
) -> None:
    """
    Recompute global_avg_score and global_rating_count for one song without committing.

    Flushes first so pending ranking score changes are visible to the aggregate query.
    Locks the songs row for update to prevent concurrent aggregate races when multiple
    users rate the same song simultaneously.
    """
    # Flush any pending ranking changes before querying AVG — autoflush=False means
    # SQLAlchemy will not do this automatically.
    db.flush()
    song = db.execute(
        select(Song)
        .where(Song.id == song_id)
        .with_for_update()
    ).scalar_one()
    result = db.execute(
        select(
            func.count(Ranking.id),
            func.sum(Ranking.score),
            func.avg(Ranking.score),
        )
        .where(Ranking.song_id == song_id)
    ).one()
    count = result[0]
    rating_sum = result[1]
    avg = result[2]
    song.global_rating_count = count
    song.global_rating_sum = float(rating_sum) if count > 0 else None
    song.global_avg_score = float(avg) if count > 0 else None
    db.flush()


def increment_song_aggregate(
    db: Session,
    song_id: int,
    score: float,
) -> None:
    """Add one current ranking score to a song's aggregate state without committing."""
    song = _lock_song_for_aggregate(
        db,
        song_id,
    )
    count = song.global_rating_count
    rating_sum = _current_rating_sum(song)
    new_count = count + 1
    new_sum = rating_sum + score
    _apply_aggregate_state(
        song,
        count=new_count,
        rating_sum=new_sum,
    )
    db.flush()


def decrement_song_aggregate(
    db: Session,
    song_id: int,
    score: float,
) -> None:
    """Remove one current ranking score from a song's aggregate state without committing."""
    song = _lock_song_for_aggregate(
        db,
        song_id,
    )
    count = song.global_rating_count
    if count == 0:
        raise RuntimeError("Cannot decrement song aggregate with rating count 0.")
    if song.global_rating_sum is None:
        raise RuntimeError("Cannot decrement song aggregate with null rating sum.")

    new_count = count - 1
    new_sum = song.global_rating_sum - score
    _apply_aggregate_state(
        song,
        count=new_count,
        rating_sum=new_sum,
    )
    db.flush()


def adjust_song_aggregate(
    db: Session,
    song_id: int,
    old_score: float,
    new_score: float,
) -> None:
    """Apply a score delta when a current ranking row persists without committing."""
    song = _lock_song_for_aggregate(
        db,
        song_id,
    )
    count = song.global_rating_count
    if count == 0:
        raise RuntimeError("Cannot adjust song aggregate with rating count 0.")
    if song.global_rating_sum is None:
        raise RuntimeError("Cannot adjust song aggregate with null rating sum.")

    _apply_aggregate_state(
        song,
        count=count,
        rating_sum=song.global_rating_sum - old_score + new_score,
    )
    db.flush()


def _lock_song_for_aggregate(
    db: Session,
    song_id: int,
) -> Song:
    """Lock one song row before changing aggregate fields inside the current transaction."""
    db.flush()
    return db.execute(
        select(Song)
        .where(Song.id == song_id)
        .with_for_update()
    ).scalar_one()


def _current_rating_sum(
    song: Song,
) -> float:
    """Return the current sum, rejecting corrupt non-empty aggregate state."""
    if song.global_rating_count == 0:
        return 0.0
    if song.global_rating_sum is None:
        raise RuntimeError("Song aggregate has ratings but null rating sum.")
    return song.global_rating_sum


def _apply_aggregate_state(
    song: Song,
    count: int,
    rating_sum: float,
) -> None:
    """Maintain the count/sum/average aggregate invariant on one song row."""
    if count < 0:
        raise RuntimeError("Song aggregate rating count cannot be negative.")
    if count == 0:
        song.global_rating_count = 0
        song.global_rating_sum = None
        song.global_avg_score = None
        return

    song.global_rating_count = count
    song.global_rating_sum = rating_sum
    song.global_avg_score = rating_sum / count


def update_musicbrainz_metadata(
    db: Session,
    song: Song,
    musicbrainz_id: str,
    genres_mb: list[str],
    release_year: int | None,
    enriched_at: datetime,
) -> Song:
    """Apply MusicBrainz enrichment results to a song without committing."""
    song.musicbrainz_id = musicbrainz_id
    song.genres_mb = genres_mb
    song.release_year = release_year
    song.metadata_enriched_at = enriched_at
    return song
