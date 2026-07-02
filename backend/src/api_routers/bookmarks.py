"""HTTP boundary for per-user Bookmarks."""
from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.bookmarks import (
    BookmarkCreate,
    BookmarkListResponse,
    BookmarkRemoveResponse,
    BookmarkResponse,
    BookmarkStatusResponse,
)
from src.services.bookmarks import (
    bookmark_song,
    get_bookmark_status,
    list_my_bookmarks,
    remove_bookmark,
)
from src.services.musicbrainz_tasks import enrich_song_metadata_task
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/bookmarks",
    tags=["bookmarks"],
)


@router.get(
    "",
    response_model=BookmarkListResponse,
)
@limiter.limit("300/minute")
def my_bookmarks(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BookmarkListResponse:
    """Return the authenticated user's Bookmarks."""
    return list_my_bookmarks(
        db,
        user_id=current_user.id,
    )


@router.get(
    "/by-deezer/{deezer_id}",
    response_model=BookmarkStatusResponse,
)
@limiter.limit("300/minute")
def bookmark_status(
    request: Request,
    deezer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BookmarkStatusResponse:
    """Return bookmark state for one song."""
    return get_bookmark_status(
        db,
        user_id=current_user.id,
        deezer_id=deezer_id,
    )


@router.post(
    "",
    response_model=BookmarkResponse,
)
@limiter.limit("60/minute")
def bookmark_song_endpoint(
    request: Request,
    data: BookmarkCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BookmarkResponse:
    """Bookmark one song for the authenticated user."""
    response = bookmark_song(
        db,
        user_id=current_user.id,
        data=data,
    )
    background_tasks.add_task(
        enrich_song_metadata_task,
        response.song.id,
    )
    return response


@router.delete(
    "/{song_id}",
    response_model=BookmarkRemoveResponse,
)
@limiter.limit("60/minute")
def remove_bookmark_endpoint(
    request: Request,
    song_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BookmarkRemoveResponse:
    """Remove one bookmark for the authenticated user."""
    return remove_bookmark(
        db,
        user_id=current_user.id,
        song_id=song_id,
    )
