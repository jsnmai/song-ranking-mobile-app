"""Schemas for likes on activity cards."""
from pydantic import BaseModel


class ActivityLikeResponse(BaseModel):
    """Like state for one activity card after a like/unlike, or when fetched."""

    rating_event_id: int
    like_count: int
    liked_by_viewer: bool
