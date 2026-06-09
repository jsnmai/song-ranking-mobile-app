"""Schemas for Friends' 9s and Co-Sign discovery surfaces."""
from datetime import datetime

from pydantic import BaseModel

from src.pydantic_schemas.song import SongResponse


class SocialDiscoveryContributor(BaseModel):
    """One visible friend contributing a high score."""

    user_id: int
    username: str
    display_name: str
    score: float


class FriendsNineItem(BaseModel):
    """One song with at least one visible friend's high score."""

    song: SongResponse
    visible_high_score_friend_count: int
    average_visible_friend_score: float
    latest_visible_rating_at: datetime
    contributors: list[SocialDiscoveryContributor]
    is_bookmarked: bool


class FriendsNinesResponse(BaseModel):
    """Current-user Friends' 9s recommendations."""

    items: list[FriendsNineItem]


class CoSignItem(BaseModel):
    """One song Co-Signed by at least two visible friends."""

    song: SongResponse
    co_sign_count: int
    average_visible_friend_score: float
    latest_visible_rating_at: datetime
    contributors: list[SocialDiscoveryContributor]
    is_bookmarked: bool


class CoSignsResponse(BaseModel):
    """Current-user Co-Sign recommendations."""

    items: list[CoSignItem]
