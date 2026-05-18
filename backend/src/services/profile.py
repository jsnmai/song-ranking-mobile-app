# Business logic for profile management.
# All decisions about what constitutes a valid profile setup live here.
# The router calls these functions; this layer calls the crud layer for data access.
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.crud.profile import create_profile, get_by_user_id, get_by_username
from src.pydantic_schemas.profile import ProfileResponse, ProfileSetup


def setup_profile(
    db: Session,
    user_id: int,
    data: ProfileSetup,
) -> ProfileResponse:
    """
    Create a profile for a newly registered user.

    1. Username already taken? → 409
    2. Create the profile row via the crud layer
    3. Return the new profile as a ProfileResponse

    username arrives already lowercased — the Pydantic validator normalises it before this is called.
    """
    existing = get_by_username(
        db,
        data.username,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken.",
        )

    try:
        profile = create_profile(
            db,
            user_id=user_id,
            username=data.username,
            display_name=data.display_name,
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken.",
        )

    return ProfileResponse.model_validate(profile)


def get_my_profile(
    db: Session,
    user_id: int,
) -> ProfileResponse:
    """Return the profile for the given user, or 404 if they have not completed setup."""
    profile = get_by_user_id(
        db,
        user_id,
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    return ProfileResponse.model_validate(profile)
