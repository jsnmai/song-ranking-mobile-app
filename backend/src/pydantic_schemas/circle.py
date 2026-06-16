"""Schemas for circle-aggregate discovery modules (Most-rated, Trending).

These shapes are surface-neutral: although the routes currently sit under /discover,
the responses are reusable by Feed/Profile. "Your circle" means mutual follows whose
taste is visible to the viewer (see crud.social_access.circle_visible_taste_owner_predicate).
The viewer is never counted in an aggregate; their own rating is exposed separately as
`viewer_rating`.
"""
from datetime import datetime

from pydantic import BaseModel

from src.pydantic_schemas.song import SongResponse


class CircleContributor(BaseModel):
    """One visible circle member contributing to an aggregate."""

    user_id: int
    username: str
    display_name: str
    score: float
    bucket: str


class ViewerRating(BaseModel):
    """The viewer's own current rating for a song, shown separately and never counted."""

    score: float
    bucket: str


class CircleMostRatedItem(BaseModel):
    """One song currently rated by at least 3 visible circle members."""

    song: SongResponse
    circle_rating_count: int
    average_circle_score: float
    contributors: list[CircleContributor]
    viewer_rating: ViewerRating | None
    latest_circle_rating_at: datetime


class CircleMostRatedResponse(BaseModel):
    """Current-user Most-rated-in-circle module."""

    items: list[CircleMostRatedItem]


class CircleTrendingItem(BaseModel):
    """One song rated by at least 3 visible circle members inside the recent window."""

    song: SongResponse
    recent_circle_rating_count: int
    average_circle_score: float
    contributors: list[CircleContributor]
    viewer_rating: ViewerRating | None
    latest_circle_rating_at: datetime


class CircleTrendingResponse(BaseModel):
    """Current-user Trending-in-circle module."""

    items: list[CircleTrendingItem]
    window_days: int
