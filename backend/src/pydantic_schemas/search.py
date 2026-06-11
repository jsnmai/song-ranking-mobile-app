# Pydantic schemas for normalized song search responses.
from pydantic import BaseModel


class SongSearchResult(BaseModel):
    """One normalized Deezer search result returned to the frontend."""

    deezer_id: int
    isrc: str | None = None
    title: str
    artist: str
    artist_deezer_id: int
    album: str
    cover_url: str
    preview_url: str | None = None
    # Viewer's existing rating, so search rows can show a rated state instead of a Rate action.
    my_bucket: str | None = None
    my_score: float | None = None


class SongSearchResponse(BaseModel):
    """Response body for GET /search/songs."""

    results: list[SongSearchResult]
