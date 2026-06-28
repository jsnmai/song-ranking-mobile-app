"""Business logic for likes on activity cards.

A like targets one activity card = one rating event (a rate/rerate verdict). Self-likes are
allowed. You can only like / see the likers of an activity you are allowed to view, so likes
ride the same taste-visibility/block rules as the rest of the social surfaces.

Like counts are display-only-private: an author can hide their like counts, which suppresses
the count and the likers list for *other* viewers. The author still sees their own count and
likers, and likes still notify the author. A viewer always knows whether they themselves liked
a card (`liked_by_viewer`) so the heart toggle keeps working even when the count is hidden.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.like import (
    count_likes,
    count_likes_for_events,
    create_like,
    delete_like,
    get_likeable_event,
    has_liked,
    liked_event_ids,
    list_liker_profiles,
)
from src.crud.profile import get_by_user_id
from src.pydantic_schemas.like import ActivityLikeResponse
from src.pydantic_schemas.profile import ProfileListResponse
from src.pydantic_schemas.profile_modules import RecentRatingItem
from src.pydantic_schemas.song import SongResponse
from src.services.access import can_view_profile, can_view_taste
from src.services.notification import notify_like
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song


def like_activity(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> ActivityLikeResponse:
    """Like a visible activity card (idempotent)."""
    _event, author = _visible_activity_or_404(db, viewer_id, rating_event_id)
    create_like(db, viewer_id, rating_event_id)
    # Notify the activity's author (self-likes are allowed but never notify yourself).
    notify_like(
        db,
        recipient_id=author.user_id,
        actor_id=viewer_id,
        rating_event_id=rating_event_id,
    )
    db.commit()
    return _like_response(db, viewer_id, rating_event_id, author)


def unlike_activity(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> ActivityLikeResponse:
    """Remove the viewer's like (idempotent; allowed even if visibility later changed)."""
    delete_like(db, viewer_id, rating_event_id)
    db.commit()
    event = get_likeable_event(db, rating_event_id)
    author = get_by_user_id(db, event.user_id) if event is not None else None
    return _like_response(db, viewer_id, rating_event_id, author)


def list_activity_likers(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> ProfileListResponse:
    """Return the users who liked a visible activity, filtered by viewer-visible profiles.

    When the author hides their like counts, the likers list is empty for everyone except
    the author themselves.
    """
    event, author = _visible_activity_or_404(db, viewer_id, rating_event_id)
    if not _count_visible_to(viewer_id, author):
        return ProfileListResponse(profiles=[])
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


def get_activity_card(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> RecentRatingItem:
    """Return one visible activity card (the verdict + viewer-aware like state).

    Backs the "open the activity" tap from a like notification. Rides the same
    taste-visibility/block rules as the rest of the like surfaces (404 if hidden).
    """
    event, author = _visible_activity_or_404(db, viewer_id, rating_event_id)
    song = db.get(Song, event.song_id)
    if song is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found.",
        )
    like_state = _like_response(db, viewer_id, rating_event_id, author)
    return RecentRatingItem(
        rating_event_id=event.id,
        song=SongResponse.model_validate(song),
        bucket=event.new_bucket,
        score=event.new_score,
        note=event.note,
        created_at=event.created_at,
        like_count=like_state.like_count,
        liked_by_viewer=like_state.liked_by_viewer,
    )


def like_states_for_events(
    db: Session,
    viewer_id: int,
    events: list[tuple[int, int, bool]],
) -> dict[int, tuple[int | None, bool]]:
    """Resolve like state for a batch of activity cards in two queries.

    `events` is a list of (rating_event_id, author_user_id, author_hides_like_counts).
    Returns {rating_event_id: (like_count_or_None, liked_by_viewer)}, where like_count is
    None when the author hides counts and the viewer is not the author.
    """
    event_ids = [event_id for event_id, _, _ in events]
    counts = count_likes_for_events(db, event_ids)
    liked = liked_event_ids(db, viewer_id, event_ids)
    states: dict[int, tuple[int | None, bool]] = {}
    for event_id, author_user_id, author_hides in events:
        count = counts.get(event_id, 0)
        visible = author_user_id == viewer_id or not author_hides
        states[event_id] = (count if visible else None, event_id in liked)
    return states


def _visible_activity_or_404(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
) -> tuple[RatingEvent, Profile]:
    """Return a likeable activity (and its author) the viewer can see, or 404."""
    event = get_likeable_event(db, rating_event_id)
    author = get_by_user_id(db, event.user_id) if event is not None else None
    if event is None or author is None or not can_view_taste(db, viewer_id, author):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found.",
        )
    return event, author


def _count_visible_to(
    viewer_id: int,
    author: Profile | None,
) -> bool:
    """Whether the viewer may see the like count/likers of this author's activity."""
    if author is None:
        return True
    return author.user_id == viewer_id or not author.hide_like_counts


def _like_response(
    db: Session,
    viewer_id: int,
    rating_event_id: int,
    author: Profile | None,
) -> ActivityLikeResponse:
    """Build the current (viewer-aware) like state for an activity card."""
    return ActivityLikeResponse(
        rating_event_id=rating_event_id,
        like_count=(
            count_likes(db, rating_event_id)
            if _count_visible_to(viewer_id, author)
            else None
        ),
        liked_by_viewer=has_liked(db, viewer_id, rating_event_id),
    )
