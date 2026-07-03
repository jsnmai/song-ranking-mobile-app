"""Schemas for Co-Sign social discovery."""
from datetime import datetime

from pydantic import BaseModel

from src.pydantic_schemas.song import SongResponse


class SocialDiscoveryContributor(BaseModel):
    """One visible person the viewer follows contributing a high score."""

    user_id: int
    username: str
    display_name: str
    score: float


class CoSignItem(BaseModel):
    """One song Co-Signed by at least two visible people the viewer follows."""

    song: SongResponse
    co_sign_count: int
    # Legacy response name kept for compatibility; this is the average among visible followed users.
    average_visible_friend_score: float
    latest_visible_rating_at: datetime
    contributors: list[SocialDiscoveryContributor]
    is_bookmarked: bool


class CoSignsResponse(BaseModel):
    """Current-user Co-Sign recommendations."""

    items: list[CoSignItem]
