# HTTP layer for profile endpoints.
# Routers are intentionally thin: parse the request, call the service, return the result.
# All business logic lives in src/services/profile.py.
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.pydantic_schemas.profile import (
    ProfileListResponse,
    ProfileResponse,
    ProfileSearchResponse,
    ProfileSetup,
    ProfileSummaryResponse,
)
from src.services.profile import (
    follow_profile,
    get_my_profile,
    get_profile_by_username,
    get_profile_followers,
    get_profile_following,
    search_profiles,
    setup_profile,
    unfollow_profile,
)
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/profile",
    tags=["profile"],
)


@router.get(
    "/me",
    response_model=ProfileSummaryResponse,
)
def profile_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSummaryResponse:
    """Return the authenticated user's own profile."""
    return get_my_profile(
        db,
        user_id=current_user.id,
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


@router.get(
    "/search",
    response_model=ProfileSearchResponse,
)
def profile_search(
    q: str = Query(
        min_length=2,
        max_length=30,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSearchResponse:
    """Search public profiles by username or display name."""
    return search_profiles(
        db,
        current_user_id=current_user.id,
        query=q,
    )


@router.get(
    "/{username}",
    response_model=ProfileSummaryResponse,
)
def profile_by_username(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSummaryResponse:
    """Return a public profile by username."""
    return get_profile_by_username(
        db,
        current_user_id=current_user.id,
        username=username,
    )


@router.post(
    "/{username}/follow",
    response_model=ProfileSummaryResponse,
)
def profile_follow(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSummaryResponse:
    """Follow another user's public profile."""
    return follow_profile(
        db,
        current_user_id=current_user.id,
        username=username,
    )


@router.delete(
    "/{username}/follow",
    response_model=ProfileSummaryResponse,
)
def profile_unfollow(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSummaryResponse:
    """Unfollow another user's public profile."""
    return unfollow_profile(
        db,
        current_user_id=current_user.id,
        username=username,
    )


@router.get(
    "/{username}/followers",
    response_model=ProfileListResponse,
)
def profile_followers(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileListResponse:
    """Return profiles that follow the requested profile."""
    return get_profile_followers(
        db,
        current_user_id=current_user.id,
        username=username,
    )


@router.get(
    "/{username}/following",
    response_model=ProfileListResponse,
)
def profile_following(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileListResponse:
    """Return profiles the requested profile follows."""
    return get_profile_following(
        db,
        current_user_id=current_user.id,
        username=username,
    )
