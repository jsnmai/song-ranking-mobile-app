# Database access layer for the songs table.
# Durable song rows are created only after user action, never during search.
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from src.pydantic_schemas.song import SongCreate
from src.sqlalchemy_tables.song import Song


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
    commit: bool = True,
) -> Song:
    """
    Insert Deezer metadata for a user-touched song, or return the existing row.

    PostgreSQL handles the conflict atomically so two users touching the same
    song at the same time do not create duplicates.
    """
    statement = (
        insert(Song)
        .values(**data.model_dump())
        .on_conflict_do_nothing(index_elements=["deezer_id"])
        .returning(Song.id)
    )
    song_id = db.execute(statement).scalar_one_or_none()
    if commit:
        db.commit()

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


def update_musicbrainz_metadata(
    db: Session,
    song: Song,
    musicbrainz_id: str,
    genres_mb: list[str],
    release_year: int | None,
    enriched_at: datetime,
) -> Song:
    """Store MusicBrainz enrichment results for a song."""
    song.musicbrainz_id = musicbrainz_id
    song.genres_mb = genres_mb
    song.release_year = release_year
    song.metadata_enriched_at = enriched_at
    db.commit()
    db.refresh(song)
    return song
