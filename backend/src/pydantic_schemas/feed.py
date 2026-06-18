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
    # like_count is None when the actor hides their like counts and the viewer isn't them.
    like_count: int | None = None
    liked_by_viewer: bool = False


class FeedListResponse(BaseModel):
    """Cursor-paginated social feed response."""

    events: list[FeedEventResponse]
    next_cursor: str | None


class CircleRatersResponse(BaseModel):
    """Circle members (mutual follows, visible to the viewer) who currently rate one song.

    Powers the Recent Verdict hero's social-proof avatars. The total LISTn rating count is
    already on the song (`global_rating_count`), so it is not duplicated here.
    """

    raters: list[ProfileResponse]


class RerateRadarItem(BaseModel):
    """Re-rate Radar: one followed user's recent score change on a song (the delta)."""

    model_config = ConfigDict(from_attributes=True)

    rating_event_id: int
    actor_profile: ProfileResponse
    song: SongResponse
    previous_bucket: BucketName
    previous_score: float
    new_bucket: BucketName
    new_score: float
    note: str | None
    created_at: datetime


class FeedModulesResponse(BaseModel):
    """Bundled Feed module aggregates served behind the shared social-access privacy layer.

    One endpoint backs every Feed module card so the Feed makes a single request and the
    privacy filtering runs once per load (the paginated activity stream stays its own /feed).
    Modules that are not built yet are reserved keys that always return null for now; each
    gains its own typed model as it ships.
    """

    rerate_radar: RerateRadarItem | None = None
    # Reserved — not implemented yet; always null until each module ships.
    consensus: None = None
    disagreement_spotlight: None = None
    split_decision: None = None
    match_moment: None = None
