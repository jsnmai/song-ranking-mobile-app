"""HTTP boundary for privacy-safe social discovery recommendations."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.social_discovery import CoSignsResponse, FriendsNinesResponse
from src.services.social_discovery import list_co_signs, list_friends_nines
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/discover",
    tags=["discover"],
)


@router.get(
    "/friends-9s",
    response_model=FriendsNinesResponse,
)
@limiter.limit("300/minute")
def friends_nines(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FriendsNinesResponse:
    """Return current-user discovery from visible followed users' scores of 9+."""
    return list_friends_nines(
        db,
        user_id=current_user.id,
    )


@router.get(
    "/co-signs",
    response_model=CoSignsResponse,
)
@limiter.limit("300/minute")
def co_signs(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CoSignsResponse:
    """Return current-user songs Co-Signed by at least two visible followed users."""
    return list_co_signs(
        db,
        user_id=current_user.id,
    )
