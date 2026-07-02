# MusicBrainz metadata enrichment.
# This module is called after durable song persistence, never from search request handlers.
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from src.crud.song import (
    get_by_id,
    mark_song_enrichment_failed,
    mark_song_enrichment_no_match,
    update_musicbrainz_metadata,
)
from src.pydantic_schemas.song import SongResponse

MUSICBRAINZ_RECORDING_URL = "https://musicbrainz.org/ws/2/recording/"
MUSICBRAINZ_USER_AGENT = "LISTn/1.0 (contact@listn.app)"
MUSICBRAINZ_TIMEOUT_SECONDS = 8.0
MUSICBRAINZ_MIN_REQUEST_INTERVAL_SECONDS = 1.0
MUSICBRAINZ_FUZZY_MATCH_THRESHOLD = 90

_last_musicbrainz_request_at = 0.0


def enrich_song_metadata(
    db: Session,
    song_id: int,
) -> SongResponse | None:
    """
    Enrich a persisted song with MusicBrainz genre and release-year metadata.

    1. Skip missing or already-enriched songs without calling MusicBrainz.
    2. Prefer ISRC lookup because it is the most reliable cross-provider key.
    3. Fall back to fuzzy artist/title search only when ISRC is unavailable.
    4. Leave metadata empty if no confident match is found.
    """
    song = get_by_id(
        db,
        song_id,
    )
    if song is None:
        return None

    if song.metadata_enriched_at is not None:
        return SongResponse.model_validate(song)

    if song.enrichment_status == "no_match":
        return SongResponse.model_validate(song)

    try:
        recording = _find_musicbrainz_recording(
            isrc=song.isrc,
            artist=song.artist,
            title=song.title,
        )
        if recording is None:
            mark_song_enrichment_no_match(db, song)
            db.commit()
            db.refresh(song)
            return SongResponse.model_validate(song)

        enriched_song = update_musicbrainz_metadata(
            db,
            song,
            musicbrainz_id=str(recording["id"]),
            genres_mb=_extract_genres(recording),
            release_year=_extract_release_year(recording),
            enriched_at=datetime.now(timezone.utc),
        )
        db.commit()
        db.refresh(enriched_song)
    except Exception:
        db.rollback()
        # Best-effort status write after rollback. Re-fetch to avoid stale ORM state.
        try:
            fresh_song = get_by_id(db, song_id)
            if fresh_song is not None:
                mark_song_enrichment_failed(db, fresh_song)
                db.commit()
        except Exception:
            pass
        raise

    return SongResponse.model_validate(enriched_song)


def _find_musicbrainz_recording(
    isrc: str | None,
    artist: str,
    title: str,
) -> dict | None:
    """Return the best MusicBrainz recording match, or None if confidence is too low."""
    if isrc is not None:
        payload = _musicbrainz_recording_search(f"isrc:{isrc}")
        recordings = payload.get("recordings", [])
        if isinstance(recordings, list) and recordings:
            first_recording = recordings[0]
            if isinstance(first_recording, dict):
                return first_recording
        return None

    query = f'artist:"{artist}" AND recording:"{title}"'
    payload = _musicbrainz_recording_search(query)
    recordings = payload.get("recordings", [])
    if not isinstance(recordings, list) or not recordings:
        return None

    first_recording = recordings[0]
    if not isinstance(first_recording, dict):
        return None

    score = first_recording.get("score")
    if not isinstance(score, int) or score < MUSICBRAINZ_FUZZY_MATCH_THRESHOLD:
        return None

    return first_recording


def _musicbrainz_recording_search(query: str) -> dict:
    """Call MusicBrainz recording search with required headers and throttling."""
    _wait_for_musicbrainz_budget()
    response = httpx.get(
        MUSICBRAINZ_RECORDING_URL,
        params={
            "query": query,
            "fmt": "json",
        },
        headers={"User-Agent": MUSICBRAINZ_USER_AGENT},
        timeout=MUSICBRAINZ_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict):
        return payload
    return {}


def _wait_for_musicbrainz_budget() -> None:
    """Throttle MusicBrainz calls to one request per second per app process."""
    global _last_musicbrainz_request_at

    now = time.monotonic()
    elapsed = now - _last_musicbrainz_request_at
    if elapsed < MUSICBRAINZ_MIN_REQUEST_INTERVAL_SECONDS:
        time.sleep(MUSICBRAINZ_MIN_REQUEST_INTERVAL_SECONDS - elapsed)

    _last_musicbrainz_request_at = time.monotonic()


def _extract_genres(recording: dict) -> list[str]:
    """Extract MusicBrainz tag names in most-voted order."""
    tags = recording.get("tags", [])
    if not isinstance(tags, list):
        return []

    parsed_tags: list[tuple[int, str]] = []
    for tag in tags:
        if not isinstance(tag, dict):
            continue
        name = tag.get("name")
        count = tag.get("count", 0)
        if isinstance(name, str) and name:
            parsed_tags.append((int(count), name))

    parsed_tags.sort(reverse=True)
    return [name for _, name in parsed_tags]


def _extract_release_year(recording: dict) -> int | None:
    """Extract a release year from MusicBrainz first-release-date or release dates."""
    first_release_date = recording.get("first-release-date")
    year = _year_from_date(first_release_date)
    if year is not None:
        return year

    releases = recording.get("releases", [])
    if not isinstance(releases, list):
        return None

    years = []
    for release in releases:
        if not isinstance(release, dict):
            continue
        year = _year_from_date(release.get("date"))
        if year is not None:
            years.append(year)

    if not years:
        return None
    return min(years)


def _year_from_date(value: object) -> int | None:
    """Parse the leading four-digit year from a MusicBrainz date string."""
    if not isinstance(value, str) or len(value) < 4:
        return None
    year_part = value[:4]
    if not year_part.isdigit():
        return None
    return int(year_part)
