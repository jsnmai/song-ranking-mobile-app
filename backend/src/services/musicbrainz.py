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
from src.crud.song_provider_ref import ensure_musicbrainz_ref
from src.pydantic_schemas.song import SongResponse

MUSICBRAINZ_RECORDING_URL = "https://musicbrainz.org/ws/2/recording/"
MUSICBRAINZ_RELEASE_URL = "https://musicbrainz.org/ws/2/release/"
MUSICBRAINZ_USER_AGENT = "LISTn/1.0 (contact@listn.app)"
MUSICBRAINZ_TIMEOUT_SECONDS = 8.0
MUSICBRAINZ_MIN_REQUEST_INTERVAL_SECONDS = 1.0
MUSICBRAINZ_FUZZY_MATCH_THRESHOLD = 90
# songs.isrc is String(12); a well-formed ISRC is exactly 12 characters.
ISRC_LENGTH = 12

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
        recording, match_confidence = _find_musicbrainz_recording(
            isrc=song.isrc,
            artist=song.artist,
            title=song.title,
        )
        if recording is None:
            mark_song_enrichment_no_match(db, song)
            db.commit()
            db.refresh(song)
            return SongResponse.model_validate(song)

        recording_mbid = str(recording["id"])
        artist_mbid = _extract_artist_mbid(recording)
        release_group_mbid, track_position, track_count = _extract_release_identity(recording)
        # Harvest the ISRC when the provider gave none (Apple search has no ISRCs) — it is
        # the cross-provider song-identity key. Best-effort: a failed lookup never fails
        # enrichment, and search results do not include ISRCs, so this is one extra call.
        harvested_isrc = None
        if song.isrc is None:
            harvested_isrc = _fetch_recording_isrc(recording_mbid)

        enriched_song = update_musicbrainz_metadata(
            db,
            song,
            musicbrainz_id=recording_mbid,
            genres_mb=_extract_genres(recording),
            release_year=_extract_release_year(recording),
            enriched_at=datetime.now(timezone.utc),
            isrc=harvested_isrc,
            artist_mbid=artist_mbid,
            release_group_mbid=release_group_mbid,
            track_position=track_position,
            track_count=track_count,
        )
        ensure_musicbrainz_ref(
            db,
            enriched_song,
            recording_mbid=recording_mbid,
            artist_mbid=artist_mbid,
            release_group_mbid=release_group_mbid,
            confidence=match_confidence,
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
) -> tuple[dict | None, str]:
    """
    Return (best MusicBrainz recording match, match confidence).

    Confidence is "mb_isrc" for an ISRC-keyed match and "mb_fuzzy" for an artist/title
    search match; it is stored on the provider ref so downstream identity consumers can
    weigh harvested facts accordingly.
    """
    if isrc is not None:
        payload = _musicbrainz_recording_search(f"isrc:{isrc}")
        recordings = payload.get("recordings", [])
        if isinstance(recordings, list) and recordings:
            first_recording = recordings[0]
            if isinstance(first_recording, dict):
                return first_recording, "mb_isrc"
        return None, "mb_isrc"

    query = f'artist:"{artist}" AND recording:"{title}"'
    payload = _musicbrainz_recording_search(query)
    recordings = payload.get("recordings", [])
    if not isinstance(recordings, list) or not recordings:
        return None, "mb_fuzzy"

    first_recording = recordings[0]
    if not isinstance(first_recording, dict):
        return None, "mb_fuzzy"

    score = first_recording.get("score")
    if not isinstance(score, int) or score < MUSICBRAINZ_FUZZY_MATCH_THRESHOLD:
        return None, "mb_fuzzy"

    return first_recording, "mb_fuzzy"


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


def fetch_release_barcode(release_mbid: str) -> str | None:
    """
    Fetch one release's barcode (UPC/EAN) from MusicBrainz, or None.

    Used by the New Release feed to map a MusicBrainz release to the Apple catalog via
    UPC lookup. Best-effort and throttled like every other MusicBrainz call.
    """
    try:
        _wait_for_musicbrainz_budget()
        response = httpx.get(
            f"{MUSICBRAINZ_RELEASE_URL}{release_mbid}",
            params={"fmt": "json"},
            headers={"User-Agent": MUSICBRAINZ_USER_AGENT},
            timeout=MUSICBRAINZ_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None
    barcode = payload.get("barcode")
    if isinstance(barcode, str) and barcode.strip():
        return barcode.strip()
    return None


def _fetch_recording_isrc(recording_mbid: str) -> str | None:
    """
    Fetch one well-formed ISRC for a recording, or None.

    Search responses never include ISRCs, so this is a dedicated throttled lookup.
    Any failure returns None — enrichment must not fail over a missing ISRC.
    """
    try:
        _wait_for_musicbrainz_budget()
        response = httpx.get(
            f"{MUSICBRAINZ_RECORDING_URL}{recording_mbid}",
            params={
                "inc": "isrcs",
                "fmt": "json",
            },
            headers={"User-Agent": MUSICBRAINZ_USER_AGENT},
            timeout=MUSICBRAINZ_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None
    isrcs = payload.get("isrcs", [])
    if not isinstance(isrcs, list):
        return None
    for isrc in isrcs:
        if isinstance(isrc, str) and len(isrc) == ISRC_LENGTH:
            return isrc
    return None


def _extract_artist_mbid(recording: dict) -> str | None:
    """Extract the primary credited artist's MBID from a recording's artist-credit."""
    artist_credit = recording.get("artist-credit", [])
    if not isinstance(artist_credit, list) or not artist_credit:
        return None
    first_credit = artist_credit[0]
    if not isinstance(first_credit, dict):
        return None
    artist = first_credit.get("artist")
    if not isinstance(artist, dict):
        return None
    mbid = artist.get("id")
    if isinstance(mbid, str) and mbid:
        return mbid
    return None


def _extract_release_identity(recording: dict) -> tuple[str | None, int | None, int | None]:
    """
    Extract (release_group_mbid, track_position, track_count) from the first release.

    The first release in a search result is MusicBrainz's best-scored placement of this
    recording; position/count describe where the track sits on that release.
    """
    releases = recording.get("releases", [])
    if not isinstance(releases, list) or not releases:
        return None, None, None
    release = releases[0]
    if not isinstance(release, dict):
        return None, None, None

    release_group_mbid = None
    release_group = release.get("release-group")
    if isinstance(release_group, dict):
        group_id = release_group.get("id")
        if isinstance(group_id, str) and group_id:
            release_group_mbid = group_id

    track_count = release.get("track-count") if isinstance(release.get("track-count"), int) else None

    track_position = None
    media = release.get("media", [])
    if isinstance(media, list) and media and isinstance(media[0], dict):
        # Media carry a track-offset plus the matched track; offset is 0-based.
        offset = media[0].get("track-offset")
        if isinstance(offset, int):
            track_position = offset + 1
        if media[0].get("track-count") and isinstance(media[0].get("track-count"), int):
            track_count = media[0]["track-count"]

    return release_group_mbid, track_position, track_count


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
