"""Provider-specific finalize helpers for LISTn-owned durable song creation."""
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.crud.song import create_from_provider_metadata
from src.crud.song_provider_ref import create_provider_ref, get_song_by_provider_track
from src.pydantic_schemas.song import SongCreate, normalize_storefront
from src.sqlalchemy_tables.song import Song

APPLE_LOOKUP_URL = "https://itunes.apple.com/lookup"
APPLE_LOOKUP_TIMEOUT_SECONDS = 5.0
MAX_PROVIDER_TEXT_LENGTH = 255
MAX_PROVIDER_URL_LENGTH = 1000


def resolve_song_for_finalize(
    db: Session,
    data: SongCreate,
) -> Song:
    """
    Resolve or create the durable song for a finalized rating.

    Deezer keeps the legacy upsert path. Apple first deduplicates by provider ref,
    then tries lookup-on-finalize, and finally falls back to sanitized client data.
    """
    if data.provider != "apple":
        raise ValueError("resolve_song_for_finalize only handles Apple provider data.")

    apple_track_id = str(data.apple_track_id).strip()
    storefront = normalize_storefront(data.storefront)
    existing_song = get_song_by_provider_track(
        db,
        provider="apple",
        provider_track_id=apple_track_id,
        storefront=storefront,
    )
    if existing_song is not None:
        return existing_song

    authoritative = _lookup_apple_song(
        apple_track_id=apple_track_id,
        storefront=storefront,
    )
    if authoritative is not None:
        song_data = _song_create_from_apple_lookup(
            authoritative,
            fallback=data,
            storefront=storefront,
        )
        confidence = "apple_lookup"
    else:
        song_data = _sanitize_client_apple_payload(
            data,
            storefront=storefront,
        )
        confidence = "apple_client_search"

    try:
        with db.begin_nested():
            song = create_from_provider_metadata(
                db,
                song_data,
            )
            _create_provider_ref_for_apple_song(
                db,
                song,
                song_data,
                apple_track_id,
                storefront,
                confidence=confidence,
            )
            return song
    except IntegrityError:
        existing_song = get_song_by_provider_track(
            db,
            provider="apple",
            provider_track_id=apple_track_id,
            storefront=storefront,
        )
        if existing_song is not None:
            return existing_song
        raise

    raise RuntimeError("Apple provider ref creation failed without returning a song.")


def _create_provider_ref_for_apple_song(
    db: Session,
    song: Song,
    song_data: SongCreate,
    apple_track_id: str,
    storefront: str,
    confidence: str,
) -> None:
    """Stage the provider ref that makes an Apple song durable and deduplicable."""
    create_provider_ref(
        db,
        song_id=song.id,
        provider="apple",
        provider_track_id=apple_track_id,
        provider_artist_id=song_data.apple_artist_id,
        provider_album_id=song_data.apple_album_id,
        storefront=storefront,
        url=_safe_provider_url(song_data.apple_view_url),
        artwork_url=_safe_provider_url(song_data.artwork_url or song_data.cover_url),
        preview_available=song_data.preview_available,
        confidence=confidence,
    )


def _lookup_apple_song(
    apple_track_id: str,
    storefront: str,
) -> dict[str, object] | None:
    """Fetch one Apple/iTunes lookup row, returning None for any recoverable failure."""
    try:
        response = httpx.get(
            APPLE_LOOKUP_URL,
            params={
                "id": apple_track_id,
                "country": storefront,
            },
            timeout=APPLE_LOOKUP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list) or not results:
        return None
    for row in results:
        if isinstance(row, dict) and _is_valid_matching_apple_lookup_row(row, apple_track_id):
            return row
    return None


def _is_valid_matching_apple_lookup_row(
    row: dict[str, object],
    apple_track_id: str,
) -> bool:
    """Only trust lookup rows for the exact requested Apple track with usable facts."""
    return (
        _provider_string(row.get("trackId")) == apple_track_id
        and _provider_string(row.get("trackName")) is not None
        and _provider_string(row.get("artistName")) is not None
        and _safe_provider_url(_provider_string(row.get("trackViewUrl"))) is not None
    )


def _song_create_from_apple_lookup(
    raw: dict[str, object],
    fallback: SongCreate,
    storefront: str,
) -> SongCreate:
    """Build durable song data from Apple lookup, using client data only for absent fields."""
    release_year = _release_year(raw.get("releaseDate")) or fallback.release_year
    return _sanitize_client_apple_payload(
        SongCreate(
            provider="apple",
            apple_track_id=_provider_string(raw.get("trackId")) or fallback.apple_track_id,
            storefront=storefront,
            title=_provider_string(raw.get("trackName")) or fallback.title,
            artist=_provider_string(raw.get("artistName")) or fallback.artist,
            album=_provider_string(raw.get("collectionName")) or fallback.album,
            cover_url=_provider_string(raw.get("artworkUrl100")) or fallback.cover_url,
            artwork_url=_upsize_artwork_url(_provider_string(raw.get("artworkUrl100")))
            or fallback.artwork_url
            or fallback.cover_url,
            apple_view_url=_provider_string(raw.get("trackViewUrl")) or fallback.apple_view_url,
            apple_artist_id=_provider_string(raw.get("artistId")) or fallback.apple_artist_id,
            apple_album_id=_provider_string(raw.get("collectionId")) or fallback.apple_album_id,
            genre=_provider_string(raw.get("primaryGenreName")) or fallback.genre,
            genre_deezer=_provider_string(raw.get("primaryGenreName")) or fallback.genre_deezer,
            duration_ms=_provider_int(raw.get("trackTimeMillis")) or fallback.duration_ms,
            release_year=release_year,
            preview_available=_provider_string(raw.get("previewUrl")) is not None
            or fallback.preview_available,
        ),
        storefront=storefront,
    )


def _sanitize_client_apple_payload(
    data: SongCreate,
    storefront: str,
) -> SongCreate:
    """Validate and trim client-provided Apple search metadata for fallback persistence."""
    artwork_url = _safe_provider_url(data.artwork_url or data.cover_url)
    return SongCreate(
        provider="apple",
        apple_track_id=_required_text(data.apple_track_id, "apple_track_id", 128),
        storefront=storefront,
        title=_required_text(data.title, "title", 255),
        artist=_required_text(data.artist, "artist", 255),
        album=_bounded_text(data.album, 255) or "Unknown Album",
        cover_url=artwork_url or "",
        artwork_url=artwork_url,
        apple_view_url=_safe_provider_url(data.apple_view_url),
        apple_artist_id=_bounded_text(data.apple_artist_id, 128),
        apple_album_id=_bounded_text(data.apple_album_id, 128),
        genre=_bounded_text(data.genre or data.genre_deezer, 120),
        genre_deezer=_bounded_text(data.genre or data.genre_deezer, 120),
        duration_ms=data.duration_ms,
        release_year=data.release_year,
        preview_available=data.preview_available,
        preview_url=None,
    )


def _required_text(
    value: str | None,
    field_name: str,
    limit: int,
) -> str:
    """Return bounded required provider text or raise a validation-style error."""
    bounded = _bounded_text(value, limit)
    if bounded is None:
        raise ValueError(f"{field_name} is required.")
    return bounded


def _bounded_text(
    value: object,
    limit: int,
) -> str | None:
    """Trim provider text and cap it to a database-safe length."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


def _provider_string(value: object) -> str | None:
    """Normalize optional provider scalar values to strings."""
    return _bounded_text(value, MAX_PROVIDER_TEXT_LENGTH)


def _provider_int(value: object) -> int | None:
    """Normalize optional provider integer values."""
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _safe_provider_url(value: str | None) -> str | None:
    """Allow only http(s) provider URLs and cap stored URL length."""
    text = _bounded_text(value, MAX_PROVIDER_URL_LENGTH)
    if text is None:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return text


def _upsize_artwork_url(value: str | None) -> str | None:
    """Prefer higher-resolution Apple artwork when the search URL follows Apple's size pattern."""
    safe_url = _safe_provider_url(value)
    if safe_url is None:
        return None
    return safe_url.replace("100x100bb", "600x600bb").replace("100x100", "600x600")


def _release_year(value: object) -> int | None:
    """Extract a plausible release year from an Apple releaseDate value."""
    if not isinstance(value, str) or len(value) < 4:
        return None
    try:
        year = datetime.fromisoformat(value.replace("Z", "+00:00")).year
    except ValueError:
        try:
            year = int(value[:4])
        except ValueError:
            return None
    current_year = datetime.now(timezone.utc).year + 1
    if 1800 <= year <= current_year:
        return year
    return None
