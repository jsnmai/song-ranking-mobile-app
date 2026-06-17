# HTTP layer for profile endpoints.
# Routers are intentionally thin: parse the request, call the service, return the result.
# All business logic lives in src/services/profile.py.
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.profile import (
    BlockedProfileListResponse,
    CompatibilityResponse,
    LikePrivacyUpdate,
    MostCompatibleResponse,
    ProfileEdit,
    ProfileListResponse,
    ProfileReportCreate,
    ProfileReportResponse,
    ProfileResponse,
    ProfileSearchResponse,
    ProfileSetup,
    ProfileSummaryResponse,
    ProfileVisibilityUpdate,
    TasteProfileResponse,
)
from src.pydantic_schemas.profile_modules import ProfileActivityResponse, RecentRatingsResponse
from src.pydantic_schemas.rating import RankingAnchorsResponse, RankingListResponse
from src.pydantic_schemas.bookmarks import BookmarkListResponse
from src.services.profile import (
    block_profile,
    follow_profile,
    get_compatibility_for_username,
    get_most_compatible,
    get_my_blocked_profiles,
    get_my_profile,
    get_profile_bookmarks,
    get_profile_by_username,
    get_profile_followers,
    get_profile_following,
    report_profile,
    search_profiles,
    setup_profile,
    unblock_profile,
    unfollow_profile,
    update_my_like_privacy,
    update_my_profile,
    update_my_visibility,
)
from src.services.profile_modules import (
    get_my_recent_ratings,
    get_profile_ranking_anchors_by_username,
    get_profile_activity,
    get_profile_rankings_by_username,
    get_profile_recent_ratings,
)
from src.pydantic_schemas.auxstrology import AuxstrologyResponse
from src.services.auxstrology import (
    get_my_auxstrology,
    get_user_auxstrology_by_username,
)
from src.services.taste import (
    get_my_taste_profile,
    get_user_taste_profile_by_username,
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


@router.patch(
    "/me",
    response_model=ProfileSummaryResponse,
)
def profile_edit(
    data: ProfileEdit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSummaryResponse:
    """Update the authenticated user's display name, username, and/or avatar color."""
    return update_my_profile(
        db,
        user_id=current_user.id,
        data=data,
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


@router.put(
    "/me/visibility",
    response_model=ProfileSummaryResponse,
)
def profile_visibility(
    data: ProfileVisibilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSummaryResponse:
    """Update the authenticated user's taste visibility."""
    return update_my_visibility(
        db,
        user_id=current_user.id,
        data=data,
    )


@router.put(
    "/me/like-privacy",
    response_model=ProfileSummaryResponse,
)
def profile_like_privacy(
    data: LikePrivacyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSummaryResponse:
    """Toggle whether the user's like counts are hidden from other viewers."""
    return update_my_like_privacy(
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
    "/me/recent-ratings",
    response_model=RecentRatingsResponse,
)
@limiter.limit("300/minute")
def my_recent_ratings(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecentRatingsResponse:
    """Return the authenticated user's own recent ratings."""
    return get_my_recent_ratings(db, user_id=current_user.id)


@router.get(
    "/me/taste",
    response_model=TasteProfileResponse,
)
@limiter.limit("60/minute")
def my_taste_profile(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TasteProfileResponse:
    """Return the authenticated user's taste profile."""
    return get_my_taste_profile(
        db,
        user_id=current_user.id,
    )


@router.get(
    "/{username}/taste",
    response_model=TasteProfileResponse,
)
@limiter.limit("60/minute")
def user_taste_profile(
    request: Request,
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TasteProfileResponse:
    """Return a public profile's taste data; 404 for private profiles."""
    return get_user_taste_profile_by_username(
        db,
        current_user_id=current_user.id,
        username=username,
    )


@router.get(
    "/me/auxstrology",
    response_model=AuxstrologyResponse,
)
@limiter.limit("60/minute")
def my_auxstrology(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AuxstrologyResponse:
    """Return the authenticated user's auxstrology reading."""
    return get_my_auxstrology(
        db,
        user_id=current_user.id,
    )


@router.get(
    "/{username}/auxstrology",
    response_model=AuxstrologyResponse,
)
@limiter.limit("60/minute")
def user_auxstrology(
    request: Request,
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AuxstrologyResponse:
    """Return a public profile's auxstrology reading; 404 for private profiles."""
    return get_user_auxstrology_by_username(
        db,
        current_user_id=current_user.id,
        username=username,
    )


@router.get(
    "/{username}/compatibility",
    response_model=CompatibilityResponse,
)
@limiter.limit("60/minute")
def profile_compatibility(
    request: Request,
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CompatibilityResponse:
    """Return compatibility score between the requesting user and a public profile."""
    return get_compatibility_for_username(
        db,
        current_user=current_user,
        username=username,
    )


@router.get(
    "/me/blocked",
    response_model=BlockedProfileListResponse,
)
def profile_blocked(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BlockedProfileListResponse:
    """Return profiles blocked by the authenticated user."""
    return get_my_blocked_profiles(
        db,
        current_user_id=current_user.id,
    )


@router.get(
    "/me/most-compatible",
    response_model=MostCompatibleResponse,
)
@limiter.limit("60/minute")
def my_most_compatible(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MostCompatibleResponse:
    """Return users most taste-compatible with the current user, sorted by score."""
    return get_most_compatible(
        db,
        viewer_id=current_user.id,
    )


@router.get(
    "/{username}/recent-ratings",
    response_model=RecentRatingsResponse,
)
@limiter.limit("300/minute")
def profile_recent_ratings(
    request: Request,
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecentRatingsResponse:
    """Return a profile's recent ratings, enforcing taste visibility rules."""
    return get_profile_recent_ratings(db, viewer_id=current_user.id, username=username)


@router.get(
    "/{username}/activity",
    response_model=ProfileActivityResponse,
)
@limiter.limit("300/minute")
def profile_activity(
    request: Request,
    username: str,
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileActivityResponse:
    """Return a profile's full activity (paginated rating verdicts), enforcing visibility."""
    return get_profile_activity(
        db,
        viewer_id=current_user.id,
        username=username,
        cursor=cursor,
    )


@router.get(
    "/{username}/rankings/anchors",
    response_model=RankingAnchorsResponse,
)
@limiter.limit("300/minute")
def profile_ranking_anchors(
    request: Request,
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RankingAnchorsResponse:
    """Return a profile's ranking calibration anchors, enforcing taste visibility rules."""
    return get_profile_ranking_anchors_by_username(
        db,
        viewer_id=current_user.id,
        username=username,
    )


@router.get(
    "/{username}/rankings",
    response_model=RankingListResponse,
)
@limiter.limit("300/minute")
def profile_rankings(
    request: Request,
    username: str,
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RankingListResponse:
    """Return a profile's rankings, enforcing taste visibility rules."""
    return get_profile_rankings_by_username(
        db,
        viewer_id=current_user.id,
        username=username,
        cursor=cursor,
    )


@router.get(
    "/{username}/bookmarks",
    response_model=BookmarkListResponse,
)
@limiter.limit("300/minute")
def profile_bookmarks(
    request: Request,
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BookmarkListResponse:
    """Return a profile's bookmarks, enforcing taste visibility rules."""
    return get_profile_bookmarks(
        db,
        current_user_id=current_user.id,
        username=username,
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
    """Return a visible profile shell by username."""
    return get_profile_by_username(
        db,
        current_user_id=current_user.id,
        username=username,
    )


@router.post(
    "/{username}/block",
    response_model=ProfileSummaryResponse,
)
def profile_block(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSummaryResponse:
    """Block another user."""
    return block_profile(
        db,
        current_user_id=current_user.id,
        username=username,
    )


@router.delete(
    "/{username}/block",
    response_model=ProfileSummaryResponse,
)
def profile_unblock(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileSummaryResponse:
    """Unblock another user."""
    return unblock_profile(
        db,
        current_user_id=current_user.id,
        username=username,
    )


@router.post(
    "/{username}/report",
    response_model=ProfileReportResponse,
    status_code=201,
)
@limiter.limit("5/minute")
def profile_report(
    request: Request,
    username: str,
    data: ProfileReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileReportResponse:
    """Create a private report for another user's profile."""
    return report_profile(
        db,
        current_user_id=current_user.id,
        username=username,
        data=data,
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
