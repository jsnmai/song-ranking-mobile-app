# Pydantic schemas for rating and ranking endpoints.
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.pydantic_schemas.song import SongCreate, SongResponse

BucketName = Literal["like", "alright", "dislike"]
RatingEventType = Literal["rated", "rerated", "removed", "reordered"]


class RatingFinalizeRequest(BaseModel):
    """Request body for finalizing a rating into the current rankings."""

    song: SongCreate
    bucket: BucketName
    position: int | None = Field(
        default=None,
        ge=1,
    )
    note: str | None = Field(
        default=None,
        max_length=280,
    )

    @field_validator("note")
    @classmethod
    def note_strip(cls, value: str | None) -> str | None:
        """Store optional notes as trimmed text, or null when blank."""
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class RankingResponse(BaseModel):
    """One current ranking row with song metadata."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    song_id: int
    bucket: BucketName
    position: int
    score: float
    created_at: datetime
    updated_at: datetime
    song: SongResponse


class RatingEventResponse(BaseModel):
    """One append-only rating event."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    song_id: int
    event_type: RatingEventType
    previous_bucket: BucketName | None
    new_bucket: BucketName | None
    previous_position: int | None
    new_position: int | None
    previous_score: float | None
    new_score: float | None
    note: str | None
    event_metadata: dict[str, Any] | None = None
    created_at: datetime


class RatingFinalizeResponse(BaseModel):
    """Response body after a rating has been finalized."""

    ranking: RankingResponse
    rating_event: RatingEventResponse


class RatingRemoveResponse(BaseModel):
    """Response body after a rating has been removed."""

    rating_event: RatingEventResponse


class RankingListResponse(BaseModel):
    """Cursor-paginated current rankings for the authenticated user."""

    rankings: list[RankingResponse]
    next_cursor: str | None


class RankingReorderItem(BaseModel):
    """One row in a full-list reorder request."""

    song_id: int
    bucket: BucketName


class RankingReorderRequest(BaseModel):
    """Request body for saving a full ranked-list reorder."""

    rankings: list[RankingReorderItem] = Field(min_length=1)


class RankingReorderResponse(BaseModel):
    """Response body after a reorder save."""

    rankings: list[RankingResponse]
    rating_events: list[RatingEventResponse]
