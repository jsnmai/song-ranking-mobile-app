"""HTTP boundary for the global "Popular on LISTn" discovery module.

Sits under /discover beside the circle and co-sign routers. Auth is required (consistent with
the rest of Discover), but the response is global and viewer-independent, so `current_user` does
not parameterise the query.
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.popular import PopularResponse
from src.services.popular import list_popular
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/discover",
    tags=["discover"],
)


@router.get(
    "/popular",
    response_model=PopularResponse,
)
@limiter.limit("300/minute")
def popular(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PopularResponse:
    """Return the most-rated songs across LISTn this week, or all-time when the week is thin."""
    return list_popular(db)
