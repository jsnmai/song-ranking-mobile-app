"""Business logic for free, private current-user Saved Songs."""
from sqlalchemy.orm import Session

from src.crud.saved_songs import (
    SavedSongRow,
    create_or_get_saved_song,
    delete_user_saved_song,
    get_user_saved_song_by_deezer_id,
    get_user_saved_song_by_song_id,
    list_user_saved_songs,
)
from src.crud.song import upsert_from_deezer
from src.pydantic_schemas.saved_songs import (
    SavedSongCreate,
    SavedSongListResponse,
    SavedSongRemoveResponse,
    SavedSongResponse,
    SavedSongStatusResponse,
)
from src.services.rating import build_ranking_response

SAVED_SONGS_LIMIT = 100


def save_song(
    db: Session,
    user_id: int,
    data: SavedSongCreate,
) -> SavedSongResponse:
    """Save a song idempotently and preserve it after future rating."""
    try:
        song = upsert_from_deezer(
            db,
            data.song,
        )
        create_or_get_saved_song(
            db,
            user_id=user_id,
            song_id=song.id,
            source=data.source,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    row = get_user_saved_song_by_song_id(
        db,
        user_id=user_id,
        song_id=song.id,
    )
    if row is None:
        raise RuntimeError("Saved song disappeared after commit.")
    return _save_response(row)


def list_my_saved_songs(
    db: Session,
    user_id: int,
) -> SavedSongListResponse:
    """Return the authenticated user's private Saved Songs newest first."""
    return SavedSongListResponse(
        saves=[
            _save_response(row)
            for row in list_user_saved_songs(
                db,
                user_id=user_id,
                limit=SAVED_SONGS_LIMIT,
            )
        ],
    )


def get_saved_song_status(
    db: Session,
    user_id: int,
    deezer_id: int,
) -> SavedSongStatusResponse:
    """Return whether one provider song is saved by the current user."""
    row = get_user_saved_song_by_deezer_id(
        db,
        user_id=user_id,
        deezer_id=deezer_id,
    )
    return SavedSongStatusResponse(
        is_saved=row is not None,
        save=_save_response(row) if row is not None else None,
    )


def remove_saved_song(
    db: Session,
    user_id: int,
    song_id: int,
) -> SavedSongRemoveResponse:
    """Remove one save idempotently without deleting durable song metadata."""
    try:
        removed = delete_user_saved_song(
            db,
            user_id=user_id,
            song_id=song_id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return SavedSongRemoveResponse(
        song_id=song_id,
        removed=removed,
    )


def _save_response(row: SavedSongRow) -> SavedSongResponse:
    """Build one Saved Songs response from owner-scoped joined data."""
    return SavedSongResponse(
        id=row.save.id,
        source=row.save.source,
        saved_at=row.save.created_at,
        song=row.song,
        ranking=build_ranking_response(row.ranking, row.song) if row.ranking is not None else None,
    )
