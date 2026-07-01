"""Business logic for per-user Bookmarks."""
from sqlalchemy.orm import Session

from src.crud.bookmarks import (
    BookmarkRow,
    create_or_get_bookmark,
    delete_user_bookmark,
    get_user_bookmark_by_deezer_id,
    get_user_bookmark_by_song_id,
    list_user_bookmarks,
)
from src.crud.song import upsert_from_deezer
from src.pydantic_schemas.bookmarks import (
    BookmarkCreate,
    BookmarkListResponse,
    BookmarkRemoveResponse,
    BookmarkResponse,
    BookmarkStatusResponse,
)
from src.services.rating import build_ranking_response

BOOKMARKS_LIMIT = 100


def bookmark_song(
    db: Session,
    user_id: int,
    data: BookmarkCreate,
) -> BookmarkResponse:
    """Bookmark a song idempotently and preserve it after future rating."""
    try:
        song = upsert_from_deezer(
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
