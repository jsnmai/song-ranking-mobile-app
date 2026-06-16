# HTTP layer for client-reported interaction events.
# Routers are intentionally thin: parse the request, call the service, return the result.
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.events import InteractionEventCreate, InteractionEventResponse
from src.services.events import record_client_event
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/events",
    tags=["events"],
)


@router.post(
    "",
    response_model=InteractionEventResponse,
    status_code=201,
)
@limiter.limit("240/minute")
def create_event(
    request: Request,
    data: InteractionEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InteractionEventResponse:
    """Record one whitelisted client interaction event."""
    return record_client_event(
        db,
        user_id=current_user.id,
        data=data,
    )
