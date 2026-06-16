"""HTTP boundary for likes on activity cards."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.like import ActivityLikeResponse
from src.pydantic_schemas.profile import ProfileListResponse
from src.services.like import like_activity, list_activity_likers, unlike_activity
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/activity",
    tags=["activity"],
)


@router.post(
    "/{rating_event_id}/likes",
    response_model=ActivityLikeResponse,
)
@limiter.limit("120/minute")
def like_activity_card(
    request: Request,
    rating_event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ActivityLikeResponse:
    """Like a visible activity card."""
    return like_activity(
        db,
        viewer_id=current_user.id,
        rating_event_id=rating_event_id,
    )


@router.delete(
    "/{rating_event_id}/likes",
    response_model=ActivityLikeResponse,
)
@limiter.limit("120/minute")
def unlike_activity_card(
    request: Request,
    rating_event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ActivityLikeResponse:
    """Remove the current user's like from an activity card."""
    return unlike_activity(
        db,
        viewer_id=current_user.id,
        rating_event_id=rating_event_id,
    )


@router.get(
    "/{rating_event_id}/likes",
    response_model=ProfileListResponse,
)
@limiter.limit("120/minute")
def activity_likers(
    request: Request,
    rating_event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileListResponse:
    """Return the users who liked an activity card."""
    return list_activity_likers(
        db,
        viewer_id=current_user.id,
        rating_event_id=rating_event_id,
    )
