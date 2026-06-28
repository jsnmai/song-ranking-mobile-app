"""Schemas for in-app notifications (follows + likes)."""
from datetime import datetime

from pydantic import BaseModel

from src.pydantic_schemas.profile import ProfileResponse
from src.pydantic_schemas.song import SongResponse

# "follow" | "like"
NotificationType = str


class NotificationItem(BaseModel):
    """One in-app notification shown in the recipient's list."""

    id: int
    type: NotificationType
    # Who caused it (the follower / the liker).
    actor: ProfileResponse
    # The liked song for "like" notifications; null for "follow".
    song: SongResponse | None = None
    # The liked activity card for "like" notifications; null for "follow".
    rating_event_id: int | None = None
    created_at: datetime
    read: bool


class NotificationListResponse(BaseModel):
    """Cursor-paginated notifications, newest first."""

    items: list[NotificationItem]
    next_cursor: str | None


class UnreadCountResponse(BaseModel):
    """How many unread notifications the recipient has (drives the header badge)."""

    unread_count: int
