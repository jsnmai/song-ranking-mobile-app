from datetime import datetime

from pydantic import BaseModel

from src.pydantic_schemas.song import SongResponse


class RecentRatingItem(BaseModel):
    rating_event_id: int
    song: SongResponse
    bucket: str
    score: float
    note: str | None
    created_at: datetime
    # like_count is None when the owner hides their like counts and the viewer isn't them.
    like_count: int | None = None
    liked_by_viewer: bool = False


class RecentRatingsResponse(BaseModel):
    items: list[RecentRatingItem]
