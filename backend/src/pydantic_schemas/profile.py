# Pydantic schemas for profile request bodies and response payloads.
import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProfileSetup(BaseModel):
    """Request body for POST /profile/setup."""

    display_name: str = Field(
        min_length=1,
        max_length=30,
    )
    username: str = Field(
        min_length=3,
        max_length=20,
    )

    @field_validator("username")
    @classmethod
    def username_valid_chars(cls, value: str) -> str:
        """Reject usernames that contain anything other than letters, numbers, or underscores."""
        if not re.match(r"^[a-zA-Z0-9_]+$", value):
            raise ValueError("Username may only contain letters, numbers, and underscores.")
        return value.lower()  # store and compare as lowercase

    @field_validator("display_name")
    @classmethod
    def display_name_strip(cls, value: str) -> str:
        """Strip leading and trailing whitespace from the display name."""
        return value.strip()


class ProfileResponse(BaseModel):
    """Response body for any endpoint that returns a profile."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    username: str
    display_name: str
    is_public: bool
    created_at: datetime


class ProfileSummaryResponse(ProfileResponse):
    """Profile plus social relationship metadata for the current user."""

    follower_count: int
    following_count: int
    is_following: bool
    is_own_profile: bool


class ProfileSearchResponse(BaseModel):
    """Response body for username search in Discover."""

    results: list[ProfileSummaryResponse]


class ProfileListResponse(BaseModel):
    """Response body for follower and following lists."""

    profiles: list[ProfileSummaryResponse]


class TasteGenreItem(BaseModel):
    """One genre entry in a taste profile section."""

    name: str
    count: int
    percentage: float


class TasteArtistItem(BaseModel):
    """One artist entry in a taste profile section."""

    name: str
    count: int


class TasteSection(BaseModel):
    """Genre and artist breakdown for a set of ratings."""

    genres: list[TasteGenreItem]
    top_artists: list[TasteArtistItem]


class TasteBucketSection(TasteSection):
    """Taste section for one bucket, with bucket-level score and count."""

    avg_score: float | None
    count: int


class TasteBucketBreakdown(BaseModel):
    """Song counts per bucket."""

    like: int
    okay: int
    dislike: int


class TasteByBucket(BaseModel):
    """Taste sections broken down by bucket."""

    like: TasteBucketSection
    okay: TasteBucketSection
    dislike: TasteBucketSection


class TasteProfileResponse(BaseModel):
    """Full taste profile response."""

    total_rated: int
    avg_score: float | None
    bucket_breakdown: TasteBucketBreakdown
    overall: TasteSection
    by_bucket: TasteByBucket


class CompatibilityResponse(BaseModel):
    """Response body for GET /profile/{username}/compatibility."""

    has_overlap: bool
    similarity_score: float | None
    shared_song_count: int
    # Formatted at service time from structured snapshot fields.
    # Never stored pre-formatted in the database.
    explanation: str
    is_plus: bool
