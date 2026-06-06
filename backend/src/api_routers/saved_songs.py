"""HTTP boundary for private current-user Saved Songs."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.saved_songs import (
    SavedSongCreate,
    SavedSongListResponse,
    SavedSongRemoveResponse,
    SavedSongResponse,
    SavedSongStatusResponse,
)
from src.services.saved_songs import (
    get_saved_song_status,
    list_my_saved_songs,
    remove_saved_song,
    save_song,
)
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/saved-songs",
    tags=["saved-songs"],
)


@router.get(
    "",
    response_model=SavedSongListResponse,
)
@limiter.limit("300/minute")
def my_saved_songs(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedSongListResponse:
    """Return the authenticated user's private Saved Songs."""
    return list_my_saved_songs(
        db,
        user_id=current_user.id,
    )


@router.get(
    "/by-deezer/{deezer_id}",
    response_model=SavedSongStatusResponse,
)
@limiter.limit("300/minute")
def saved_song_status(
    request: Request,
    deezer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedSongStatusResponse:
    """Return saved state for one song."""
    return get_saved_song_status(
        db,
        user_id=current_user.id,
        deezer_id=deezer_id,
    )


@router.post(
    "",
    response_model=SavedSongResponse,
)
@limiter.limit("60/minute")
def save_song_endpoint(
    request: Request,
    data: SavedSongCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedSongResponse:
    """Save one song for the authenticated user."""
    return save_song(
        db,
        user_id=current_user.id,
        data=data,
    )


@router.delete(
    "/{song_id}",
    response_model=SavedSongRemoveResponse,
)
@limiter.limit("60/minute")
def remove_saved_song_endpoint(
    request: Request,
    song_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedSongRemoveResponse:
    """Remove one saved song for the authenticated user."""
    return remove_saved_song(
        db,
        user_id=current_user.id,
        song_id=song_id,
    )
