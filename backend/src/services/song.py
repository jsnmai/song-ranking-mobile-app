# Business logic for durable song persistence and preview URL refresh.
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from src.crud.song import (
    get_by_deezer_id,
    get_by_id,
    parse_preview_url_expires_at,
    update_preview_url,
    upsert_from_deezer,
)
from src.crud.song_provider_ref import get_song_provider_ref
from src.pydantic_schemas.song import SavedSongPreviewUrlResponse, SongCreate, SongResponse
from src.services.provider_catalog import lookup_apple_song
from src.sqlalchemy_tables.song_provider_ref import SongProviderRef


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


def get_preview_url_by_song_id(
    db: Session,
    song_id: int,
) -> SavedSongPreviewUrlResponse:
    """
    Return a playable preview for a durable LISTn song by provider state.

    Apple lookup stays read-only and lazy: this service is reached only by the
    tap-triggered endpoint and never writes Apple's ephemeral preview URL.
    Legacy Deezer songs keep the existing refresh-and-persist behavior.
    """
    song = get_by_id(
        db,
        song_id,
    )
    if song is None:
        raise ValueError(f"Song with id {song_id} not in durable catalog.")

    apple_ref = get_song_provider_ref(
        db,
        song_id=song.id,
        provider="apple",
    )
    if apple_ref is not None:
        lookup = lookup_apple_song(
            apple_track_id=apple_ref.provider_track_id,
            storefront=apple_ref.storefront,
        )
        preview_url = _apple_preview_url(lookup)
        return SavedSongPreviewUrlResponse(
            preview_url=preview_url,
            apple_view_url=apple_ref.url,
        )

    if song.deezer_id is not None:
        return SavedSongPreviewUrlResponse(
            preview_url=get_or_refresh_preview_url(
                db,
                song.deezer_id,
            ),
            apple_view_url=None,
        )

    return SavedSongPreviewUrlResponse(
        preview_url=None,
        apple_view_url=None,
    )


def build_song_response(
    db: Session,
    song_id: int,
    song: object,
) -> SongResponse:
    """Attach local provider-ref preview hints without calling external providers."""
    apple_ref = get_song_provider_ref(
        db,
        song_id=song_id,
        provider="apple",
    )
    return build_song_response_from_provider_ref(
        song,
        apple_ref,
    )


def build_song_response_from_provider_ref(
    song: object,
    apple_ref: SongProviderRef | None,
) -> SongResponse:
    """Build a song response from already-loaded provider-ref state."""
    response = SongResponse.model_validate(song)
    if apple_ref is not None:
        response.apple_view_url = apple_ref.url
        response.preview_available = apple_ref.preview_available
    elif response.deezer_id is not None:
        response.preview_available = response.preview_url is not None
    return response


def _apple_preview_url(
    lookup: dict[str, object] | None,
) -> str | None:
    """Extract Apple's ephemeral preview URL from an exact-track lookup row."""
    if lookup is None:
        return None
    value = lookup.get("previewUrl")
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


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

    return build_song_response(
        db,
        song.id,
        song,
    )
