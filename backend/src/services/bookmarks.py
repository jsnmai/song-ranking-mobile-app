"""Business logic for per-user Bookmarks."""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.bookmarks import (
    BookmarkRow,
    create_or_get_bookmark,
    delete_user_bookmark,
    get_user_bookmark_by_deezer_id,
    get_user_bookmark_by_song_id,
    list_user_bookmarks,
)
from src.crud.song import get_by_id, upsert_from_deezer
from src.crud.song_provider_ref import ensure_deezer_legacy_ref
from src.pydantic_schemas.bookmarks import (
    BookmarkCreate,
    BookmarkListResponse,
    BookmarkRemoveResponse,
    BookmarkResponse,
    BookmarkStatusResponse,
)
from src.pydantic_schemas.song import SongCreate
from src.services.provider_catalog import resolve_song_for_finalize
from src.services.rating import build_ranking_response

BOOKMARKS_LIMIT = 100


def _resolve_bookmark_song(
    db: Session,
    song_data: SongCreate,
):
    """Resolve the durable song for a bookmark, dispatching by provider like rating finalize."""
    if song_data.provider == "listn" and song_data.id is not None:
        song = get_by_id(
            db,
            song_data.id,
        )
        if song is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Song not found.",
            )
        return song
    if song_data.provider == "apple":
        return resolve_song_for_finalize(
            db,
            song_data,
        )
    song = upsert_from_deezer(
        db,
        song_data,
    )
    ensure_deezer_legacy_ref(
        db,
        song,
    )
    return song


def bookmark_song(
    db: Session,
    user_id: int,
    data: BookmarkCreate,
) -> BookmarkResponse:
    """Bookmark a song idempotently and preserve it after future rating."""
    try:
        song = _resolve_bookmark_song(
            db,
            data.song,
        )
        create_or_get_bookmark(
            db,
            user_id=user_id,
            song_id=song.id,
            source=data.source,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    row = get_user_bookmark_by_song_id(
        db,
        user_id=user_id,
        song_id=song.id,
    )
    if row is None:
        raise RuntimeError("Bookmark disappeared after commit.")
    return _bookmark_response(
        db,
        row,
    )


def list_my_bookmarks(
    db: Session,
    user_id: int,
) -> BookmarkListResponse:
    """Return the authenticated user's Bookmarks, newest first."""
    return BookmarkListResponse(
        bookmarks=[
            _bookmark_response(
                db,
                row,
            )
            for row in list_user_bookmarks(
                db,
                user_id=user_id,
                limit=BOOKMARKS_LIMIT,
            )
        ],
    )


def get_bookmark_status(
    db: Session,
    user_id: int,
    deezer_id: int,
) -> BookmarkStatusResponse:
    """Return whether one provider song is bookmarked by the current user."""
    row = get_user_bookmark_by_deezer_id(
        db,
        user_id=user_id,
        deezer_id=deezer_id,
    )
    return BookmarkStatusResponse(
        is_bookmarked=row is not None,
        bookmark=_bookmark_response(db, row) if row is not None else None,
    )


def get_bookmark_status_by_song_id(
    db: Session,
    user_id: int,
    song_id: int,
) -> BookmarkStatusResponse:
    """Return whether one durable LISTn song is bookmarked by the current user."""
    row = get_user_bookmark_by_song_id(
        db,
        user_id=user_id,
        song_id=song_id,
    )
    return BookmarkStatusResponse(
        is_bookmarked=row is not None,
        bookmark=_bookmark_response(db, row) if row is not None else None,
    )


def remove_bookmark(
    db: Session,
    user_id: int,
    song_id: int,
) -> BookmarkRemoveResponse:
    """Remove one bookmark idempotently without deleting durable song metadata."""
    try:
        removed = delete_user_bookmark(
            db,
            user_id=user_id,
            song_id=song_id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return BookmarkRemoveResponse(
        song_id=song_id,
        removed=removed,
    )


def _bookmark_response(
    db: Session,
    row: BookmarkRow,
) -> BookmarkResponse:
    """Build one BookmarkResponse from owner-scoped joined data."""
    return BookmarkResponse(
        id=row.bookmark.id,
        source=row.bookmark.source,
        bookmarked_at=row.bookmark.created_at,
        song=row.song,
        ranking=build_ranking_response(db, row.ranking, row.song) if row.ranking is not None else None,
    )
