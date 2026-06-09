"""Pydantic schemas for per-user Bookmarks."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from src.pydantic_schemas.rating import RankingResponse
from src.pydantic_schemas.song import SongCreate, SongResponse

BookmarkSource = Literal["search", "song_detail", "feed", "rankings", "discovery", "manual", "unknown"]


class BookmarkCreate(BaseModel):
    """Bookmark one normalized song for the current user."""

    song: SongCreate
    source: BookmarkSource | None = None


class BookmarkResponse(BaseModel):
    """One bookmark with optional current Ranking state."""

    id: int
    source: BookmarkSource | None
    bookmarked_at: datetime
    song: SongResponse
    ranking: RankingResponse | None


class BookmarkListResponse(BaseModel):
    """Current-user Bookmarks, newest first."""

    bookmarks: list[BookmarkResponse]


class BookmarkStatusResponse(BaseModel):
    """Bookmark state for one provider song."""

    is_bookmarked: bool
    bookmark: BookmarkResponse | None


class BookmarkRemoveResponse(BaseModel):
    """Idempotent removal response for one bookmark."""

    song_id: int
    removed: bool
