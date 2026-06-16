"""Business logic for likes on activity cards.

A like targets one activity card = one rating event (a rate/rerate verdict). Self-likes are
allowed. You can only like / see the likers of an activity you are allowed to view, so likes
ride the same taste-visibility/block rules as the rest of the social surfaces.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.like import (
    count_likes,
    create_like,
    delete_like,
    get_likeable_event,
    has_liked,
    list_liker_profiles,
)
from src.crud.profile import get_by_user_id
from src.pydantic_schemas.like import ActivityLikeResponse
from src.pydantic_schemas.profile import ProfileListResponse
from src.services.access import can_view_profile, can_view_taste
from src.sqlalchemy_tables.rating_event import RatingEvent


def like_activity(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> ActivityLikeResponse:
    """Like a visible activity card (idempotent)."""
    _visible_activity_or_404(db, viewer_id, rating_event_id)
    create_like(db, viewer_id, rating_event_id)
    db.commit()
    return _like_response(db, viewer_id, rating_event_id)


def unlike_activity(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> ActivityLikeResponse:
    """Remove the viewer's like (idempotent; allowed even if visibility later changed)."""
    delete_like(db, viewer_id, rating_event_id)
    db.commit()
    return _like_response(db, viewer_id, rating_event_id)


def list_activity_likers(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> ProfileListResponse:
    """Return the users who liked a visible activity, filtered by viewer-visible profiles."""
    _visible_activity_or_404(db, viewer_id, rating_event_id)
    # Imported here to avoid a circular import with the profile service.
    from src.services.profile import _build_profile_summary

    return ProfileListResponse(
        profiles=[
            _build_profile_summary(
                db,
                viewer_id,
                liker_profile,
            )
            for liker_profile in list_liker_profiles(db, rating_event_id)
            if can_view_profile(
                db,
                viewer_id,
                liker_profile.user_id,
            )
        ],
    )


def _visible_activity_or_404(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> RatingEvent:
    """Return a likeable activity the viewer can see, or 404 (no existence disclosure)."""
    event = get_likeable_event(db, rating_event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found.",
        )
    author = get_by_user_id(db, event.user_id)
    if author is None or not can_view_taste(db, viewer_id, author):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found.",
        )
    return event


def _like_response(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> ActivityLikeResponse:
    """Build the current like state for an activity card."""
    return ActivityLikeResponse(
        rating_event_id=rating_event_id,
        like_count=count_likes(db, rating_event_id),
        liked_by_viewer=has_liked(db, viewer_id, rating_event_id),
    )
