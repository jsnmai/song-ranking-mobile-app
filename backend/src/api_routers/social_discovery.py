"""HTTP boundary for privacy-safe social discovery recommendations."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter, user_or_ip_key
from src.pydantic_schemas.social_discovery import CoSignsResponse
from src.services.social_discovery import list_co_signs
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/discover",
    tags=["discover"],
)


@router.get(
    "/co-signs",
    response_model=CoSignsResponse,
)
@limiter.limit("300/minute", key_func=user_or_ip_key)
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
