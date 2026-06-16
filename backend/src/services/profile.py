# Business logic for profile management.
# All decisions about what constitutes a valid profile setup live here.
# The router calls these functions; this layer calls the crud layer for data access.
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.crud.block import (
    create_block,
    delete_block,
    get_block,
    has_block_between,
    list_blocked_profiles,
)
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
from src.crud.rating import count_user_rankings
from src.crud.report import create_report
from src.crud.bookmarks import count_user_bookmarks, list_user_bookmarks
from src.crud.similarity import get_most_compatible_users, get_snapshot_for_pair
from src.pydantic_schemas.profile import (
    BlockedProfileListResponse,
    CompatibilityResponse,
    MostCompatibleItem,
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
    UserStats,
)
from src.pydantic_schemas.bookmarks import BookmarkListResponse, BookmarkResponse
from src.services.access import can_view_profile, can_view_taste
from src.services.access import is_plus as check_is_plus
from src.services.rating import build_ranking_response
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
    is_blocked = (
        current_user_id != profile.user_id
        and has_block_between(
            db,
            current_user_id,
            profile.user_id,
        )
    )
    taste_visible = can_view_taste(db, current_user_id, profile)
    user_stats = (
        UserStats(
            rated_count=count_user_rankings(db, profile.user_id),
            bookmarked_count=count_user_bookmarks(db, profile.user_id),
        )
        if taste_visible
        else None
    )
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
        # Reverse direction powers mutual-follow UI like the MUTUAL chip on follow lists.
        is_followed_by=get_follow(
            db,
            profile.user_id,
            current_user_id,
        ) is not None,
        is_own_profile=current_user_id == profile.user_id,
        can_view_taste=taste_visible,
        is_blocked=is_blocked,
        user_stats=user_stats,
    )


def _get_profile_shell_by_username(
    db: Session,
    current_user_id: int,
    username: str,
) -> Profile:
    """Return a minimal profile shell unless the profile is missing or blocked."""
    profile = get_by_username(
        db,
        username,
    )
    if not profile or not can_view_profile(
        db,
        current_user_id,
        profile.user_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    return profile


def _get_taste_visible_profile_by_username(
    db: Session,
    current_user_id: int,
    username: str,
) -> Profile:
    """Return a profile when the current viewer may see taste-bearing data."""
    profile = _get_profile_shell_by_username(
        db,
        current_user_id,
        username,
    )
    if not can_view_taste(
        db,
        current_user_id,
        profile,
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
    """Return another user's minimal profile shell, including follow state for the current user."""
    profile = _get_profile_shell_by_username(
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
    """Search public profiles by username or display name, with viewer taste similarity."""
    profiles = search_by_username(
        db,
        query,
    )
    results = []
    for profile in profiles:
        if not can_view_profile(
            db,
            current_user_id,
            profile.user_id,
        ):
            continue
        summary = _build_profile_summary(
            db,
            current_user_id,
            profile,
        )
        # Search rows surface taste match; other profile summaries skip the snapshot lookup.
        if not summary.is_own_profile and summary.can_view_taste:
            snapshot = get_snapshot_for_pair(
                db,
                current_user_id,
                profile.user_id,
                _ALGORITHM_VERSION,
            )
            if snapshot is not None:
                summary.similarity_score = snapshot.similarity_score
        results.append(summary)
    return ProfileSearchResponse(results=results)


def update_my_visibility(
    db: Session,
    user_id: int,
    data: ProfileVisibilityUpdate,
) -> ProfileSummaryResponse:
    """Update the current user's taste visibility."""
    profile = get_by_user_id(
        db,
        user_id,
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    profile.visibility = data.visibility
    profile.is_public = data.visibility == "public"
    try:
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise

    return _build_profile_summary(
        db,
        user_id,
        profile,
    )


def update_my_profile(
    db: Session,
    user_id: int,
    data: ProfileEdit,
) -> ProfileSummaryResponse:
    """Apply a partial update to the current user's own profile.

    Only fields present on the request are changed. A username collision with
    another user raises 409; the username is already lowercased by the schema.
    """
    profile = get_by_user_id(
        db,
        user_id,
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    if data.username is not None and data.username != profile.username:
        existing = get_by_username(
            db,
            data.username,
        )
        if existing is not None and existing.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That username is already taken.",
            )
        profile.username = data.username
    if data.display_name is not None:
        profile.display_name = data.display_name
    if data.avatar_color is not None:
        profile.avatar_color = data.avatar_color
    if data.timezone is not None:
        profile.timezone = data.timezone

    try:
        db.commit()
        db.refresh(profile)
    except IntegrityError:
        # A concurrent insert claimed the username between the check and commit.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username is already taken.",
        )
    except Exception:
        db.rollback()
        raise

    return _build_profile_summary(
        db,
        user_id,
        profile,
    )


def follow_profile(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileSummaryResponse:
    """Follow a visible profile shell by username; duplicate follows are idempotent."""
    profile = _get_profile_shell_by_username(
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
    """Unfollow a visible profile shell by username; missing follows are idempotent."""
    profile = _get_profile_shell_by_username(
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


def _follow_list_visible(profile, current_user_id: int) -> bool:
    """Follow lists are gated for only_me profiles — only the owner sees the usernames.

    Follower/following COUNTS stay visible on the profile summary (social-graph metadata,
    matching the convention that a private account still shows its counts).
    """
    return profile.visibility != "only_me" or profile.user_id == current_user_id


def get_profile_followers(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileListResponse:
    """Return the follower list for a visible profile shell."""
    profile = _get_profile_shell_by_username(
        db,
        current_user_id,
        username,
    )
    if not _follow_list_visible(profile, current_user_id):
        return ProfileListResponse(profiles=[])
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
            if can_view_profile(
                db,
                current_user_id,
                follower_profile.user_id,
            )
        ],
    )


def get_profile_following(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileListResponse:
    """Return the following list for a visible profile shell."""
    profile = _get_profile_shell_by_username(
        db,
        current_user_id,
        username,
    )
    if not _follow_list_visible(profile, current_user_id):
        return ProfileListResponse(profiles=[])
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
            if can_view_profile(
                db,
                current_user_id,
                following_profile.user_id,
            )
        ],
    )


def block_profile(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileSummaryResponse:
    """Block another user by username; duplicate blocks are idempotent."""
    profile = get_by_username(
        db,
        username,
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    if profile.user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot block yourself.",
        )

    existing = get_block(
        db,
        current_user_id,
        profile.user_id,
    )
    if not existing:
        try:
            create_block(
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


def unblock_profile(
    db: Session,
    current_user_id: int,
    username: str,
) -> ProfileSummaryResponse:
    """Unblock another user by username; missing blocks are idempotent."""
    profile = get_by_username(
        db,
        username,
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    block = get_block(
        db,
        current_user_id,
        profile.user_id,
    )
    if block:
        try:
            delete_block(
                db,
                block,
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


def report_profile(
    db: Session,
    current_user_id: int,
    username: str,
    data: ProfileReportCreate,
) -> ProfileReportResponse:
    """Create a private safety report for a visible profile shell."""
    profile = _get_profile_shell_by_username(
        db,
        current_user_id,
        username,
    )
    if profile.user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot report yourself.",
        )

    try:
        report = create_report(
            db,
            reporter_user_id=current_user_id,
            reported_user_id=profile.user_id,
            target_type=data.target_type,
            target_id=None,
            reason=data.reason,
            details=data.details,
        )
        db.commit()
        db.refresh(report)
    except Exception:
        db.rollback()
        raise

    return ProfileReportResponse.model_validate(report)


def get_my_blocked_profiles(
    db: Session,
    current_user_id: int,
) -> BlockedProfileListResponse:
    """Return profiles blocked by the current user."""
    return BlockedProfileListResponse(
        profiles=[
            _build_profile_summary(
                db,
                current_user_id,
                profile,
            )
            for profile in list_blocked_profiles(
                db,
                current_user_id,
            )
        ],
    )


def get_profile_bookmarks(
    db: Session,
    current_user_id: int,
    username: str,
) -> BookmarkListResponse:
    """Return another user's bookmarks, enforcing taste visibility."""
    profile = _get_taste_visible_profile_by_username(db, current_user_id, username)
    rows = list_user_bookmarks(db, user_id=profile.user_id, limit=100)
    return BookmarkListResponse(
        bookmarks=[
            BookmarkResponse(
                id=row.bookmark.id,
                source=row.bookmark.source,
                bookmarked_at=row.bookmark.created_at,
                song=row.song,
                ranking=build_ranking_response(row.ranking, row.song) if row.ranking is not None else None,
            )
            for row in rows
        ],
    )


_ALGORITHM_VERSION = "v1_cosine"


def _build_explanation_from_parts(
    shared_top_artists: list[str],
    shared_genres: list[str],
    shared_song_count: int,
) -> str:
    """Format a one-phrase explanation from structured compatibility fields."""
    if shared_top_artists:
        return f"Both love {shared_top_artists[0]}"
    if shared_genres:
        return f"You both rate {shared_genres[0]} highly"
    return f"You agree on {shared_song_count} songs"


def _build_explanation(snapshot: UserSimilaritySnapshot) -> str:
    """Format a one-phrase explanation from a snapshot row."""
    return _build_explanation_from_parts(
        snapshot.shared_top_artists,
        snapshot.shared_genres,
        snapshot.shared_song_count,
    )


def get_compatibility_for_username(
    db: Session,
    current_user: User,
    username: str,
) -> CompatibilityResponse:
    """
    Return compatibility data for current_user vs target username.

    404 when the target profile does not exist or taste visibility blocks the
    current viewer. No snapshot returns 200 with has_overlap=False so the
    frontend can show the safe state instead of treating it as an error.
    """
    target_profile = _get_taste_visible_profile_by_username(
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


def get_most_compatible(
    db: Session,
    viewer_id: int,
) -> MostCompatibleResponse:
    """Return users most taste-compatible with the current user, sorted by score."""
    rows = get_most_compatible_users(db, viewer_id)
    return MostCompatibleResponse(
        users=[
            MostCompatibleItem(
                username=row.username,
                display_name=row.display_name,
                similarity_score=row.similarity_score,
                shared_song_count=row.shared_song_count,
                explanation=_build_explanation_from_parts(
                    row.shared_top_artists,
                    row.shared_genres,
                    row.shared_song_count,
                ),
                computed_at=row.computed_at,
            )
            for row in rows
        ]
    )
