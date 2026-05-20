# Business logic for durable song persistence and preview URL refresh.
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from src.crud.song import get_by_deezer_id, parse_preview_url_expires_at, update_preview_url, upsert_from_deezer
from src.pydantic_schemas.song import SongCreate, SongResponse


def get_or_refresh_preview_url(
    db: Session,
    deezer_id: int,
) -> str | None:
    """
    Return a fresh preview URL for a song in the durable catalog, refreshing from Deezer if stale.

    1. Look up the song by deezer_id — raise ValueError if not in catalog.
    2. Return the stored URL immediately if it expires more than 10 minutes from now.
    3. Call the Deezer track API to fetch a fresh URL; fall back to the stored URL on any network error.
    4. Persist the refreshed URL and its new Akamai expiry timestamp.
    5. Return the fresh URL.
    """
    song = get_by_deezer_id(db, deezer_id)
    if song is None:
        raise ValueError(f"Song with deezer_id {deezer_id} not in durable catalog.")

    cutoff = datetime.now(timezone.utc) + timedelta(minutes=10)
    if (
        song.preview_url is not None
        and song.preview_url_expires_at is not None
        and song.preview_url_expires_at > cutoff
    ):
        return song.preview_url

    try:
        response = httpx.get(
            f"https://api.deezer.com/track/{deezer_id}",
            timeout=5.0,
        )
        response.raise_for_status()
        data = response.json()
        raw = data.get("preview") or None
        fresh_url = raw if raw else None
    except Exception:
        # Network or parse failure — return whatever is stored rather than breaking the UI.
        return song.preview_url

    expires_at = parse_preview_url_expires_at(fresh_url)
    try:
        update_preview_url(db, song, fresh_url, expires_at)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return fresh_url


def persist_user_touched_song(
    db: Session,
    data: SongCreate,
) -> SongResponse:
    """
    Persist a song only after meaningful user action.

    Search results stay transient. Rating/bookmark flows call this service when
    a song enters LISTn's durable product graph.
    """
    try:
        song = upsert_from_deezer(
            db,
            data,
        )
        db.commit()
        db.refresh(song)
    except Exception:
        db.rollback()
        raise

    return SongResponse.model_validate(song)
