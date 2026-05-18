# Business logic for song search.
# Search calls Deezer server-side and returns normalized DTOs without writing to the database.
import httpx
from fastapi import HTTPException, status

from src.pydantic_schemas.search import SongSearchResponse, SongSearchResult

DEEZER_SEARCH_URL = "https://api.deezer.com/search"
DEEZER_SEARCH_TIMEOUT_SECONDS = 5.0
DEEZER_SEARCH_LIMIT = 10


def search_deezer_songs(query: str) -> SongSearchResponse:
    """
    Search Deezer and normalize the response for LISTn clients.

    1. Call Deezer server-side so provider details never leak into the frontend.
    2. Normalize each track into LISTn's stable search DTO.
    3. Skip malformed provider rows instead of failing the whole search.
    4. Return transient results only — no DB writes happen in Phase 3 search.
    """
    try:
        response = httpx.get(
            DEEZER_SEARCH_URL,
            params={
                "q": query,
                "limit": DEEZER_SEARCH_LIMIT,
            },
            timeout=DEEZER_SEARCH_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as err:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Song search is temporarily unavailable.",
        ) from err

    data = payload.get("data")
    if not isinstance(data, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Song search is temporarily unavailable.",
        )

    results: list[SongSearchResult] = []
    for raw_track in data:
        normalized_track = _normalize_deezer_track(raw_track)
        if normalized_track is not None:
            results.append(normalized_track)

    return SongSearchResponse(results=results)


def _normalize_deezer_track(raw_track: object) -> SongSearchResult | None:
    """Convert one Deezer track object into a stable LISTn search result."""
    if not isinstance(raw_track, dict):
        return None

    try:
        artist = raw_track["artist"]
        album = raw_track["album"]
        if not isinstance(artist, dict) or not isinstance(album, dict):
            return None

        return SongSearchResult(
            deezer_id=int(raw_track["id"]),
            isrc=_optional_string(raw_track.get("isrc")),
            title=str(raw_track["title"]),
            artist=str(artist["name"]),
            artist_deezer_id=int(artist["id"]),
            album=str(album["title"]),
            cover_url=str(album.get("cover_medium") or album.get("cover") or ""),
            preview_url=_optional_string(raw_track.get("preview")),
        )
    except (KeyError, TypeError, ValueError):
        return None


def _optional_string(value: object) -> str | None:
    """Return a non-empty string or None for optional provider fields."""
    if isinstance(value, str) and value:
        return value
    return None
