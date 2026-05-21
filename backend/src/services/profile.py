# Business logic for profile management.
# All decisions about what constitutes a valid profile setup live here.
# The router calls these functions; this layer calls the crud layer for data access.
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.crud.follow import (
    count_followers,
    count_following,
    create_follow,
    delete_follow,
    get_follow,
    list_followers,
    list_following,
)
from src.crud.profile import create_profile, get_by_user_id, get_by_username, search_by_username
from src.pydantic_schemas.profile import (
    ProfileListResponse,
    ProfileResponse,
    ProfileSearchResponse,
    ProfileSetup,
    ProfileSummaryResponse,
)
from src.sqlalchemy_tables.profile import Profile


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
        db.commit()
        db.refresh(profile)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken.",
        )
    except Exception:
        db.rollback()
        raise

    return ProfileResponse.model_validate(profile)


def _build_profile_summary(
    db: Session,
    current_user_id: int,
    profile: Profile,
) -> ProfileSummaryResponse:
    """Return a profile plus counts and current-user relationship state."""
    base = ProfileResponse.model_validate(profile)
    return ProfileSummaryResponse(
        **base.model_dump(),
        follower_count=count_followers(
            db,
            profile.user_id,
        ),
        following_count=count_following(
            db,
            profile.user_id,
        ),
        is_following=get_follow(
            db,
            current_user_id,
            profile.user_id,
        ) is not None,
        is_own_profile=current_user_id == profile.user_id,
    )


def _get_visible_profile_by_username(
    db: Session,
    current_user_id: int,
    username: str,
) -> Profile:
    """Return a public profile by username, allowing the owner to view their own private profile."""
    profile = get_by_username(
        db,
        username,
    )
    if not profile or (
        not profile.is_public
        and profile.user_id != current_user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    return profile


def get_my_profile(
    db: Session,
    user_id: int,
) -> ProfileSummaryResponse:
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
    return _build_profile_summary(
        db,
        user_id,
        profile,
    )


def get_profile_by_username(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileSummaryResponse:
    """Return another user's public profile, including follow state for the current user."""
    profile = _get_visible_profile_by_username(
        db,
        current_user_id,
        username,
    )
    return _build_profile_summary(
        db,
        current_user_id,
        profile,
    )


def search_profiles(
    db: Session,
    current_user_id: int,
    query: str,
) -> ProfileSearchResponse:
    """Search public profiles by username or display name."""
    profiles = search_by_username(
        db,
        query,
    )
    return ProfileSearchResponse(
        results=[
            _build_profile_summary(
                db,
                current_user_id,
                profile,
            )
            for profile in profiles
        ],
    )


def follow_profile(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileSummaryResponse:
    """Follow a public profile by username; duplicate follows are idempotent."""
    profile = _get_visible_profile_by_username(
        db,
        current_user_id,
        username,
    )
    if profile.user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot follow yourself.",
        )

    if get_follow(
        db,
        current_user_id,
        profile.user_id,
    ):
        return _build_profile_summary(
            db,
            current_user_id,
            profile,
        )

    try:
        create_follow(
            db,
            current_user_id,
            profile.user_id,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
    except Exception:
        db.rollback()
        raise

    return _build_profile_summary(
        db,
        current_user_id,
        profile,
    )


def unfollow_profile(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileSummaryResponse:
    """Unfollow a public profile by username; missing follows are idempotent."""
    profile = _get_visible_profile_by_username(
        db,
        current_user_id,
        username,
    )
    follow = get_follow(
        db,
        current_user_id,
        profile.user_id,
    )
    if not follow:
        return _build_profile_summary(
            db,
            current_user_id,
            profile,
        )

    try:
        delete_follow(
            db,
            follow,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return _build_profile_summary(
        db,
        current_user_id,
        profile,
    )


def get_profile_followers(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileListResponse:
    """Return the follower list for a public profile."""
    profile = _get_visible_profile_by_username(
        db,
        current_user_id,
        username,
    )
    return ProfileListResponse(
        profiles=[
            _build_profile_summary(
                db,
                current_user_id,
                follower_profile,
            )
            for follower_profile in list_followers(
                db,
                profile.user_id,
            )
        ],
    )


def get_profile_following(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileListResponse:
    """Return the following list for a public profile."""
    profile = _get_visible_profile_by_username(
        db,
        current_user_id,
        username,
    )
    return ProfileListResponse(
        profiles=[
            _build_profile_summary(
                db,
                current_user_id,
                following_profile,
            )
            for following_profile in list_following(
                db,
                profile.user_id,
            )
        ],
    )
