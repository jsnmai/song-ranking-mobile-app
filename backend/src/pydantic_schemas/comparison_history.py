"""Pydantic schemas for current-user Versus History."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from src.pydantic_schemas.rating import BucketName


class ComparisonHistoryReceiptResponse(BaseModel):
    """One completed head-to-head comparison receipt."""

    id: int
    winner_song_id: int
    winner_title: str
    winner_artist: str
    winner_cover_url: str | None
    loser_song_id: int
    loser_title: str
    loser_artist: str
    loser_cover_url: str | None
    bucket: BucketName | None
    decision_duration_ms: int | None
    comparison_session_uuid: UUID
    comparison_index_in_session: int | None
    finalized_at: datetime


class ComparisonHistoryListResponse(BaseModel):
    """Recent finalized Versus History receipts for the current user."""

    receipts: list[ComparisonHistoryReceiptResponse]
