"""Feature and privacy access gates."""
from sqlalchemy.orm import Session

from src.crud.block import has_block_between
from src.crud.follow import get_follow
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.user import User

PUBLIC = "public"
FRIENDS_ONLY = "friends_only"
ONLY_ME = "only_me"


def is_plus(current_user: User) -> bool:
    """
    Return True if the user has active Plus membership.

    Returns False at launch. When Plus launches, this is the only function
    that changes — all endpoints that call it will gate correctly with no
    additional code changes across the codebase.
    """
    return False


def can_view_profile(
    db: Session,
    viewer_id: int,
    owner_id: int,
) -> bool:
    """Return whether viewer can see the target's minimal profile shell."""
    if viewer_id == owner_id:
        return True
    return not has_block_between(
        db,
        viewer_id,
        owner_id,
    )


def can_view_taste(
    db: Session,
    viewer_id: int,
    profile: Profile,
) -> bool:
    """Return whether viewer can see target taste-bearing data."""
    if viewer_id == profile.user_id:
        return True
    if has_block_between(
        db,
        viewer_id,
        profile.user_id,
    ):
        return False

    visibility = profile.visibility
    if visibility == PUBLIC:
        return True
    if visibility == FRIENDS_ONLY:
        return _are_mutual_follows(
            db,
            viewer_id,
            profile.user_id,
        )
    return False


def can_use_user_in_social_surface(
    db: Session,
    viewer_id: int,
    profile: Profile,
) -> bool:
    """Return whether a user's identity/taste can appear in a social surface."""
    return can_view_taste(
        db,
        viewer_id,
        profile,
    )


def can_use_rating_in_social_surface(
    db: Session,
    viewer_id: int,
    profile: Profile,
) -> bool:
    """Return whether a user's rating event can appear in a social surface."""
    return can_view_taste(
        db,
        viewer_id,
        profile,
    )


def _are_mutual_follows(
    db: Session,
    viewer_id: int,
    owner_id: int,
) -> bool:
    """Return True when both users follow each other."""
    return (
        get_follow(
            db,
            viewer_id,
            owner_id,
        ) is not None
        and get_follow(
            db,
            owner_id,
            viewer_id,
        ) is not None
    )
