"""HTTP boundary for in-app notifications."""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.notification import (
    NotificationListResponse,
    UnreadCountResponse,
)
from src.services.notification import (
    get_my_notifications,
    get_unread_count,
    mark_notifications_read,
)
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
)


@router.get(
    "",
    response_model=NotificationListResponse,
)
@limiter.limit("300/minute")
def my_notifications(
    request: Request,
    limit: int = Query(default=30, ge=1, le=50),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationListResponse:
    """Return the authenticated user's notifications, newest first."""
    return get_my_notifications(
        db,
        user_id=current_user.id,
        limit=limit,
        cursor=cursor,
    )


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
)
@limiter.limit("300/minute")
def unread_count(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCountResponse:
    """Return the unread notification count for the header badge."""
    return get_unread_count(
        db,
        user_id=current_user.id,
    )


@router.post(
    "/read",
    response_model=UnreadCountResponse,
)
@limiter.limit("120/minute")
def mark_read(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCountResponse:
    """Mark all of the user's notifications as read."""
    return mark_notifications_read(
        db,
        user_id=current_user.id,
    )
