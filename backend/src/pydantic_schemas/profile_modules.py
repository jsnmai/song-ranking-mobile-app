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


class ProfileActivityResponse(BaseModel):
    """Cursor-paginated full activity (rating verdicts) for one profile, newest first."""

    items: list[RecentRatingItem]
    next_cursor: str | None


class RankingBucketCounts(BaseModel):
    """Totals per bucket (plus the combined total) for the rankings filter tabs."""

    all: int
    like: int
    alright: int
    dislike: int


class ArtistFacet(BaseModel):
    artist: str
    count: int


class AlbumFacet(BaseModel):
    # key is artist + NUL + album so the client can identify an album uniquely across artists.
    key: str
    album: str
    artist: str
    count: int


class ProfileRankingFacetsResponse(BaseModel):
    """Aggregate filter options for a profile's rankings, computed over the full visible set."""

    bucket_counts: RankingBucketCounts
    artists: list[ArtistFacet]
    albums: list[AlbumFacet]
