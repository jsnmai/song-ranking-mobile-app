from datetime import datetime

from pydantic import BaseModel

from src.pydantic_schemas.song import SongResponse


class RecentVerdictItem(BaseModel):
    rating_event_id: int
    song: SongResponse
    bucket: str
    score: float
    note: str | None
    created_at: datetime


class RecentVerdictsResponse(BaseModel):
    items: list[RecentVerdictItem]
