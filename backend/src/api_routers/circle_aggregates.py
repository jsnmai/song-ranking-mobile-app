"""HTTP boundary for circle-aggregate discovery modules (Most-rated, Trending).

Routes sit under /discover to match the existing social-discovery router, but the
responses are surface-neutral and reusable by Feed/Profile.
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter, user_or_ip_key
from src.pydantic_schemas.circle import CircleMostRatedResponse, CircleTrendingResponse
from src.services.circle_aggregates import list_circle_most_rated, list_circle_trending
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/discover/circle",
    tags=["discover"],
)


@router.get(
    "/most-rated",
    response_model=CircleMostRatedResponse,
)
@limiter.limit("300/minute", key_func=user_or_ip_key)
def circle_most_rated(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CircleMostRatedResponse:
    """Return songs the most visible circle members currently rate."""
    return list_circle_most_rated(
        db,
        user_id=current_user.id,
    )


@router.get(
    "/trending",
    response_model=CircleTrendingResponse,
)
@limiter.limit("300/minute", key_func=user_or_ip_key)
def circle_trending(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CircleTrendingResponse:
    """Return songs the most visible circle members rated within the recent window."""
    return list_circle_trending(
        db,
        user_id=current_user.id,
    )
