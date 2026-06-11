# Pydantic schemas for profile request bodies and response payloads.
import re
from datetime import datetime
from typing import Literal

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


ProfileVisibility = Literal["public", "friends_only", "only_me"]
ReportTargetType = Literal["user", "profile", "rating_event", "rating_note"]
ReportReason = Literal[
    "harassment",
    "hate_or_abuse",
    "impersonation",
    "inappropriate_content",
    "spam",
    "under_13",
    "other",
]
ReportStatus = Literal["open", "reviewed", "actioned", "dismissed"]


class ProfileVisibilityUpdate(BaseModel):
    """Request body for updating the authenticated user's taste visibility."""

    visibility: ProfileVisibility


class ProfileReportCreate(BaseModel):
    """Request body for reporting a user/profile."""

    target_type: Literal["user", "profile"] = "profile"
    reason: ReportReason
    details: str | None = Field(
        default=None,
        max_length=1000,
    )

    @field_validator("details")
    @classmethod
    def details_strip(cls, value: str | None) -> str | None:
        """Store optional details as trimmed text, or null when blank."""
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class RatingEventReportCreate(BaseModel):
    """Request body for reporting a visible rating event or rating note."""

    target_type: Literal["rating_event", "rating_note"] = "rating_event"
    reason: ReportReason
    details: str | None = Field(
        default=None,
        max_length=1000,
    )

    @field_validator("details")
    @classmethod
    def details_strip(cls, value: str | None) -> str | None:
        """Store optional details as trimmed text, or null when blank."""
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ProfileReportResponse(BaseModel):
    """Response body after creating a private safety report."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    reporter_user_id: int | None
    reported_user_id: int | None
    target_type: ReportTargetType
    target_id: int | None
    reason: ReportReason
    details: str | None
    status: ReportStatus
    created_at: datetime


class ProfileResponse(BaseModel):
    """Response body for any endpoint that returns a profile."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    username: str
    display_name: str
    is_public: bool
    visibility: ProfileVisibility
    created_at: datetime


class UserStats(BaseModel):
    """Rated and bookmarked counts, shown when the viewer can see taste data."""

    rated_count: int
    bookmarked_count: int


class ProfileSummaryResponse(ProfileResponse):
    """Profile plus social relationship metadata for the current user."""

    follower_count: int
    following_count: int
    is_following: bool
    is_followed_by: bool
    is_own_profile: bool
    can_view_taste: bool
    is_blocked: bool
    user_stats: UserStats | None = None
    # Taste similarity with the viewer, populated only on surfaces that need it (user search).
    similarity_score: float | None = None


class BlockedProfileListResponse(BaseModel):
    """Response body for blocked profile settings."""

    profiles: list[ProfileSummaryResponse]


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


class MostCompatibleItem(BaseModel):
    """One user entry in the Most Compatible ranked list."""

    username: str
    display_name: str
    similarity_score: float
    shared_song_count: int
    explanation: str
    computed_at: datetime


class MostCompatibleResponse(BaseModel):
    """Response body for GET /profile/me/most-compatible."""

    users: list[MostCompatibleItem]
