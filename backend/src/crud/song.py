# Database access layer for the songs table.
# Durable song rows are created only after user action, never during search.
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from src.pydantic_schemas.song import SongCreate
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
