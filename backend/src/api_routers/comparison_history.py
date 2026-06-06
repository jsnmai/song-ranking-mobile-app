"""HTTP boundary for current-user Versus History."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.comparison_history import ComparisonHistoryListResponse
from src.services.comparison_history import list_my_comparison_history
from src.sqlalchemy_tables.user import User

router = APIRouter(
    tags=["comparison-history"],
)


@router.get(
    "/rankings/me/versus-history",
    response_model=ComparisonHistoryListResponse,
)
@limiter.limit("300/minute")
def my_versus_history(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonHistoryListResponse:
    """Return the authenticated user's recent completed comparison receipts."""
    return list_my_comparison_history(
        db,
        user_id=current_user.id,
    )
