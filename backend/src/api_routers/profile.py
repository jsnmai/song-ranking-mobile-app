# HTTP layer for profile endpoints.
# Routers are intentionally thin: parse the request, call the service, return the result.
# All business logic lives in src/services/profile.py.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.pydantic_schemas.profile import ProfileResponse, ProfileSetup
from src.services.profile import setup_profile
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/profile",
    tags=["profile"],
)


@router.post(
    "/setup",
    response_model=ProfileResponse,
    status_code=201,
)
def profile_setup(
    data: ProfileSetup,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileResponse:
    """
    Create a profile for the currently authenticated user.

    Called once immediately after registration — the frontend submits name and
    username as the final step of the registration wizard.
    Requires a valid JWT — the user must be registered and logged in first.
    """
    return setup_profile(
        db,
        user_id=current_user.id,
        data=data,
    )
