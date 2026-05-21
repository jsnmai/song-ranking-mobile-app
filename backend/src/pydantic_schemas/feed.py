# Pydantic schemas for the social feed.
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from src.pydantic_schemas.profile import ProfileResponse
from src.pydantic_schemas.rating import BucketName, RatingEventType
from src.pydantic_schemas.song import SongResponse


class FeedEventResponse(BaseModel):
    """One social feed item from a followed user's rating activity."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: RatingEventType
    new_bucket: BucketName
    new_score: float
    note: str | None
    created_at: datetime
    actor_profile: ProfileResponse
    song: SongResponse


class FeedListResponse(BaseModel):
    """Cursor-paginated social feed response."""

    events: list[FeedEventResponse]
    next_cursor: str | None
