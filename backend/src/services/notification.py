"""Business logic for in-app notifications (follows + likes).

A notification is one row per (recipient, actor, type, target). To stay accurate while
collapsing obvious spam, re-triggers are handled by a short resurface cooldown:

  - First follow/like  -> a new unread row.
  - Re-trigger within the cooldown (e.g. unfollow→refollow, unlike→relike in quick
    succession) -> silent no-op; the existing row is untouched.
  - Re-trigger after the cooldown -> the row is bumped (created_at refreshed, marked
    unread again) so a genuine later interaction resurfaces at the top.

The row is never deleted on unfollow/unlike, so history ("@x followed you · 3d ago")
stays. notify_* run inside the caller's transaction and never commit themselves.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.crud.notification import (
    count_unread,
    create_notification,
    get_notification,
    list_notifications,
    mark_all_read,
    resurface_notification,
)
from src.pydantic_schemas.notification import (
    NotificationItem,
    NotificationListResponse,
    UnreadCountResponse,
)
from src.pydantic_schemas.profile import ProfileResponse
from src.pydantic_schemas.song import SongResponse
from src.sqlalchemy_tables.notification import Notification
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song

NOTIFICATION_TYPE_FOLLOW = "follow"
NOTIFICATION_TYPE_LIKE = "like"

DEFAULT_NOTIFICATION_LIMIT = 30
MAX_NOTIFICATION_LIMIT = 50

# A re-trigger within this window of the existing row is treated as obvious spam and ignored;
# past it, a genuine re-follow/re-like resurfaces the row as unread. Tunable.
NOTIFICATION_RESURFACE_COOLDOWN = timedelta(minutes=5)


# ── Producers (called inside the follow/like transactions, before commit) ─────────


def notify_follow(
    db: Session,
    recipient_id: int,
    actor_id: int,
) -> None:
    """Record that `actor` followed `recipient` (deduped per the resurface cooldown)."""
    if recipient_id == actor_id:
        return
    _upsert_notification(
        db,
        recipient_id=recipient_id,
        actor_id=actor_id,
        type=NOTIFICATION_TYPE_FOLLOW,
        rating_event_id=None,
    )


def notify_like(
    db: Session,
    recipient_id: int,
    actor_id: int,
    rating_event_id: int,
) -> None:
    """Record that `actor` liked `recipient`'s activity (skips self-likes; deduped)."""
    if recipient_id == actor_id:
        return
    _upsert_notification(
        db,
        recipient_id=recipient_id,
        actor_id=actor_id,
        type=NOTIFICATION_TYPE_LIKE,
        rating_event_id=rating_event_id,
    )


def _upsert_notification(
    db: Session,
    recipient_id: int,
    actor_id: int,
    type: str,
    rating_event_id: int | None,
) -> None:
    """Create, resurface, or silently skip a notification per the cooldown rules."""
    now = datetime.now(timezone.utc)
    existing = get_notification(db, recipient_id, actor_id, type, rating_event_id)
    if existing is None:
        create_notification(
            db,
            recipient_id=recipient_id,
            actor_id=actor_id,
            type=type,
            rating_event_id=rating_event_id,
            now=now,
        )
        return
    if now - existing.created_at >= NOTIFICATION_RESURFACE_COOLDOWN:
        resurface_notification(db, existing, now)
    # Within the cooldown: obvious spam — leave the existing row untouched.


# ── Consumers (the recipient's notifications screen + header badge) ───────────────


def get_my_notifications(
    db: Session,
    user_id: int,
    limit: int = DEFAULT_NOTIFICATION_LIMIT,
    cursor: str | None = None,
) -> NotificationListResponse:
    """Return the user's notifications, newest first, enriched with actor + song."""
    safe_limit = min(limit, MAX_NOTIFICATION_LIMIT)
    cursor_created_at, cursor_id = _parse_cursor(cursor)
    rows = list_notifications(
        db,
        recipient_id=user_id,
        limit=safe_limit + 1,
        cursor_created_at=cursor_created_at,
        cursor_id=cursor_id,
    )
    has_next_page = len(rows) > safe_limit
    page_rows = rows[:safe_limit]
    next_cursor = _build_cursor(page_rows[-1]) if has_next_page and page_rows else None

    actors = _actors_by_user_id(db, [row.actor_id for row in page_rows])
    songs = _songs_by_rating_event_id(
        db,
        [row.rating_event_id for row in page_rows if row.rating_event_id is not None],
    )

    items: list[NotificationItem] = []
    for row in page_rows:
        actor = actors.get(row.actor_id)
        if actor is None:
            continue
        song = songs.get(row.rating_event_id) if row.rating_event_id is not None else None
        # A like notification with no resolvable song is not actionable — skip it.
        if row.type == NOTIFICATION_TYPE_LIKE and song is None:
            continue
        items.append(
            NotificationItem(
                id=row.id,
                type=row.type,
                actor=ProfileResponse.model_validate(actor),
                song=SongResponse.model_validate(song) if song is not None else None,
                rating_event_id=row.rating_event_id,
                created_at=row.created_at,
                read=row.read_at is not None,
            )
        )

    return NotificationListResponse(items=items, next_cursor=next_cursor)


def get_unread_count(
    db: Session,
    user_id: int,
) -> UnreadCountResponse:
    """Return the recipient's unread notification count for the header badge."""
    return UnreadCountResponse(unread_count=count_unread(db, user_id))


def mark_notifications_read(
    db: Session,
    user_id: int,
) -> UnreadCountResponse:
    """Mark all of the user's notifications read (called when they open the screen)."""
    mark_all_read(db, user_id, datetime.now(timezone.utc))
    db.commit()
    return UnreadCountResponse(unread_count=0)


# ── Helpers ──────────────────────────────────────────────────────────────────────


def _actors_by_user_id(
    db: Session,
    user_ids: list[int],
) -> dict[int, Profile]:
    """Batch-load actor profiles keyed by user_id."""
    if not user_ids:
        return {}
    rows = db.execute(
        select(Profile).where(Profile.user_id.in_(set(user_ids)))
    ).scalars()
    return {profile.user_id: profile for profile in rows}


def _songs_by_rating_event_id(
    db: Session,
    rating_event_ids: list[int],
) -> dict[int, Song]:
    """Batch-load the song behind each liked activity, keyed by rating_event_id."""
    if not rating_event_ids:
        return {}
    rows = db.execute(
        select(RatingEvent.id, Song)
        .join(Song, Song.id == RatingEvent.song_id)
        .where(RatingEvent.id.in_(set(rating_event_ids)))
    ).all()
    return {event_id: song for event_id, song in rows}


def _parse_cursor(
    cursor: str | None,
) -> tuple[datetime | None, int | None]:
    """Parse a created_at/id cursor for descending pagination."""
    if cursor is None:
        return None, None
    parts = cursor.split("|")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor.",
        )
    try:
        return datetime.fromisoformat(parts[0]), int(parts[1])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor.",
        )


def _build_cursor(
    notification: Notification,
) -> str:
    """Build a cursor from the last notification in the current page."""
    return f"{notification.created_at.isoformat()}|{notification.id}"
