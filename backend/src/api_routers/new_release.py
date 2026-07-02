"""HTTP boundary for the global Discover New Release card.

Sits under /discover beside popular, circle, and co-sign. Auth is required (consistent
with the rest of Discover), but the response is global and viewer-independent.
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.new_release import NewReleaseResponse
from src.services.new_release import get_new_release
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/discover",
    tags=["discover"],
)


@router.get(
    "/new-release",
    response_model=NewReleaseResponse,
)
@limiter.limit("300/minute")
def new_release(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NewReleaseResponse:
    """Return today's featured fresh release, or an empty list before the first batch."""
    return get_new_release(db)
