"""Pydantic schemas for comparison-session endpoints."""
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from src.pydantic_schemas.rating import BucketName, RankingResponse, RatingFinalizeResponse
from src.pydantic_schemas.song import SongCreate

ComparisonSessionStatus = Literal["active", "ready_to_finalize"]
ComparisonWinner = Literal["target", "candidate"]


class ComparisonSessionStartRequest(BaseModel):
    """Request body for starting one binary-insertion comparison session."""

    song: SongCreate
    bucket: BucketName
    note: str | None = Field(
        default=None,
        max_length=280,
    )


class ComparisonChoiceRequest(BaseModel):
    """Request body for recording one head-to-head choice."""

    winner: ComparisonWinner


class ComparisonSessionResponse(BaseModel):
    """Current comparison-session state returned to the frontend."""

    session_uuid: UUID
    bucket: BucketName
    status: ComparisonSessionStatus
    target_song: SongCreate
    candidate: RankingResponse | None
    final_position: int | None
    comparison_count: int
    created_at: datetime


class ComparisonSessionCancelResponse(BaseModel):
    """Response body after canceling a comparison session."""

    session_uuid: UUID
    canceled: bool


class ComparisonSessionFinalizeResponse(BaseModel):
    """Response body after finalizing a comparison session."""

    result: RatingFinalizeResponse
