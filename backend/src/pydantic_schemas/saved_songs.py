"""Pydantic schemas for private current-user Saved Songs."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from src.pydantic_schemas.rating import RankingResponse
from src.pydantic_schemas.song import SongCreate, SongResponse

SavedSongSource = Literal["search", "song_detail", "feed", "rankings", "discovery", "manual", "unknown"]


class SavedSongCreate(BaseModel):
    """Save one normalized song for the current user."""

    song: SongCreate
    source: SavedSongSource | None = None


class SavedSongResponse(BaseModel):
    """One private saved song with optional current Ranking state."""

    id: int
    source: SavedSongSource | None
    saved_at: datetime
    song: SongResponse
    ranking: RankingResponse | None


class SavedSongListResponse(BaseModel):
    """Recent current-user Saved Songs."""

    saves: list[SavedSongResponse]


class SavedSongStatusResponse(BaseModel):
    """Saved state for one provider song."""

    is_saved: bool
    save: SavedSongResponse | None


class SavedSongRemoveResponse(BaseModel):
    """Idempotent removal response for one song."""

    song_id: int
    removed: bool
