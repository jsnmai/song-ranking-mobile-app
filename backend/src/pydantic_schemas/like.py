"""Schemas for likes on activity cards."""
from pydantic import BaseModel


class ActivityLikeResponse(BaseModel):
    """Like state for one activity card after a like/unlike, or when fetched.

    `like_count` is None when the author hides their like counts and the viewer is not the
    author; `liked_by_viewer` is always accurate so the heart toggle keeps working.
    """

    rating_event_id: int
    like_count: int | None
    liked_by_viewer: bool
