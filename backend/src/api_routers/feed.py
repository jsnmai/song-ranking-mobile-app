# HTTP layer for the social feed.
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.feed import CircleRatersResponse, FeedListResponse
from src.services.feed import list_my_feed, list_song_circle_raters
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/feed",
    tags=["feed"],
)


@router.get(
    "",
    response_model=FeedListResponse,
)
@limiter.limit("300/minute")
def my_feed(
    request: Request,
    limit: int = Query(
        default=20,
        ge=1,
        le=50,
    ),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FeedListResponse:
    """Return rating activity from users the authenticated user follows."""
    return list_my_feed(
        db,
        user_id=current_user.id,
        limit=limit,
        cursor=cursor,
    )


@router.get(
    "/songs/{song_id}/circle-raters",
    response_model=CircleRatersResponse,
)
@limiter.limit("120/minute")
def song_circle_raters(
    request: Request,
    song_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CircleRatersResponse:
    """Circle members who currently rate this song — Recent Verdict hero social proof."""
    return list_song_circle_raters(
        db,
        viewer_id=current_user.id,
        song_id=song_id,
    )
