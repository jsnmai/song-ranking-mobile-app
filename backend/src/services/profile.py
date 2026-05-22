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
from src.crud.similarity import get_snapshot_for_pair
from src.pydantic_schemas.profile import (
    CompatibilityResponse,
    ProfileListResponse,
    ProfileResponse,
    ProfileSearchResponse,
    ProfileSetup,
    ProfileSummaryResponse,
)
from src.services.access import is_plus as check_is_plus
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.user import User
from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot


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


_ALGORITHM_VERSION = "v1_cosine"


def _build_explanation(snapshot: UserSimilaritySnapshot) -> str:
    """
    Format a one-phrase explanation from structured snapshot fields.

    Tries shared artists first, then genres, then falls back to song count.
    Structured fields are used here — no pre-formatted strings are stored in
    the database so future display surfaces can format them differently.
    """
    if snapshot.shared_top_artists:
        return f"Both love {snapshot.shared_top_artists[0]}"
    if snapshot.shared_genres:
        return f"You both rate {snapshot.shared_genres[0]} highly"
    return f"You agree on {snapshot.shared_song_count} songs"


def get_compatibility_for_username(
    db: Session,
    current_user: User,
    username: str,
) -> CompatibilityResponse:
    """
    Return compatibility data for current_user vs target username.

    404 when the target profile does not exist or is private and the current
    user is not the owner or a follower — same visibility rule as all other
    profile sub-endpoints. No snapshot returns 200 with has_overlap=False so
    the frontend can show the safe state instead of treating it as an error.
    """
    target_profile = _get_visible_profile_by_username(
        db,
        current_user.id,
        username,
    )
    user_is_plus = check_is_plus(current_user)

    snapshot = get_snapshot_for_pair(
        db,
        current_user.id,
        target_profile.user_id,
        _ALGORITHM_VERSION,
    )

    if snapshot is None or snapshot.shared_song_count < 5:
        return CompatibilityResponse(
            has_overlap=False,
            similarity_score=None,
            shared_song_count=snapshot.shared_song_count if snapshot else 0,
            explanation="Not enough overlap yet · Rate more songs to compare",
            is_plus=user_is_plus,
        )

    return CompatibilityResponse(
        has_overlap=True,
        similarity_score=snapshot.similarity_score,
        shared_song_count=snapshot.shared_song_count,
        explanation=_build_explanation(snapshot),
        is_plus=user_is_plus,
    )
