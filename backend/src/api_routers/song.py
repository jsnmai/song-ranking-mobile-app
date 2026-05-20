# HTTP layer for song-level endpoints (preview URL refresh).
# Routers stay thin: validate request params, call the service, return the result.
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.song import PreviewUrlResponse
from src.services.song import get_or_refresh_preview_url
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/songs",
    tags=["songs"],
)


@router.get(
    "/{deezer_id}/preview-url",
    response_model=PreviewUrlResponse,
)
@limiter.limit("60/minute")
def get_preview_url(
    request: Request,
    deezer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PreviewUrlResponse:
    """Return a fresh preview URL for a rated song, refreshing from Deezer if the stored URL is expiring."""
    try:
        preview_url = get_or_refresh_preview_url(db, deezer_id)
    except ValueError as err:
        raise HTTPException(
            status_code=404,
            detail=str(err),
        )
    return PreviewUrlResponse(preview_url=preview_url)
