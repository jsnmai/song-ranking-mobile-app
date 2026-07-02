"""Business logic for the global Discover New Release card.

Pipeline (weekly, server-side, cached — never client-direct):
ListenBrainz Fresh Releases lists the week's official releases (built on the same CC0
MusicBrainz data the catalog already uses) → candidates are filtered to Albums/EPs with
cover art → each is mapped to the Apple catalog by barcode (`itunes.apple.com/lookup?upc=`)
→ a representative track becomes a durable LISTn song through the standard finalize
canonicalization → the endpoint serves a daily-rotating pick from the current batch.

Apple resolvability doubles as the noise filter: a release without a distributor-backed
Apple presence never ships, and everything that does plugs straight into the existing
rate/preview/attribution pipeline.
"""
import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import date, datetime

import httpx
from sqlalchemy.orm import Session

from src.core.config import settings
from src.crud.new_release import (
    create_new_release,
    latest_batch_date,
    list_batch_rows,
    list_featured_release_group_mbids,
)
from src.db.session import SessionLocal
from src.pydantic_schemas.new_release import NewReleaseItem, NewReleaseResponse
from src.pydantic_schemas.song import SongCreate
from src.services.musicbrainz import MUSICBRAINZ_USER_AGENT, fetch_release_barcode
from src.services.provider_catalog import APPLE_LOOKUP_URL, resolve_song_for_finalize
from src.services.song import build_song_response

logger = logging.getLogger(__name__)

LISTENBRAINZ_FRESH_RELEASES_URL = "https://api.listenbrainz.org/1/explore/fresh-releases/"
LISTENBRAINZ_TIMEOUT_SECONDS = 15.0
APPLE_UPC_LOOKUP_TIMEOUT_SECONDS = 8.0
# Be a polite batch caller: Apple's undocumented limit is ~20/min per IP.
APPLE_MIN_REQUEST_INTERVAL_SECONDS = 3.0
FEATURED_PRIMARY_TYPES = frozenset({"Album", "EP"})

_last_apple_request_at = 0.0


@dataclass(frozen=True)
class FreshReleaseCandidate:
    """One ListenBrainz fresh release considered for featuring."""

    release_name: str
    artist_name: str
    release_mbid: str
    release_group_mbid: str
    released_at: date


def get_new_release(
    db: Session,
) -> NewReleaseResponse:
    """Return today's featured fresh release, rotating daily through the current batch."""
    batch_date = latest_batch_date(db)
    if batch_date is None:
        return NewReleaseResponse(items=[])
    rows = list_batch_rows(
        db,
        batch_date,
    )
    if not rows:
        return NewReleaseResponse(items=[])
    pick = rows[date.today().toordinal() % len(rows)]
    return NewReleaseResponse(
        items=[
            NewReleaseItem(
                song=build_song_response(
                    db,
                    pick.song.id,
                    pick.song,
                ),
                released_at=pick.new_release.released_at,
            )
        ],
    )


def refresh_new_releases_if_stale() -> int:
    """
    Run the weekly batch when the newest batch is older than the refresh window.

    Returns how many releases were featured (0 when skipped, or when nothing resolved).
    Each successful release commits individually so partial progress survives a
    mid-batch failure.
    """
    db = SessionLocal()
    try:
        newest = latest_batch_date(db)
        today = date.today()
        if newest is not None and (today - newest).days < settings.new_release_refresh_days:
            return 0
        featured_mbids = list_featured_release_group_mbids(db)
    finally:
        db.close()

    candidates = _fetch_fresh_release_candidates()
    if not candidates:
        return 0

    featured_count = 0
    scanned = 0
    db = SessionLocal()
    try:
        for candidate in candidates:
            if featured_count >= settings.new_release_target:
                break
            if scanned >= settings.new_release_scan_cap:
                break
            scanned += 1
            if candidate.release_group_mbid in featured_mbids:
                continue
            barcode = fetch_release_barcode(candidate.release_mbid)
            if barcode is None:
                continue
            song_payload = _featured_song_payload_from_upc(barcode)
            if song_payload is None:
                continue
            try:
                song = resolve_song_for_finalize(
                    db,
                    song_payload,
                )
                create_new_release(
                    db,
                    song_id=song.id,
                    released_at=candidate.released_at,
                    release_group_mbid=candidate.release_group_mbid,
                    batch_date=today,
                    rank=featured_count,
                )
                db.commit()
            except Exception:
                db.rollback()
                logger.exception(
                    "New Release batch failed to feature release_group=%s",
                    candidate.release_group_mbid,
                )
                continue
            featured_mbids.add(candidate.release_group_mbid)
            featured_count += 1
    finally:
        db.close()

    return featured_count


async def new_release_refresh_loop() -> None:
    """
    Periodic staleness check, started from the app lifespan.

    Sleeps BEFORE the first check so short-lived processes (tests, TestClient lifespans)
    never call providers. The batch body runs in a worker thread because every provider
    call is synchronous and sleep-throttled.
    """
    while True:
        await asyncio.sleep(settings.new_release_check_interval_seconds)
        try:
            featured = await asyncio.to_thread(refresh_new_releases_if_stale)
            if featured:
                logger.info(
                    "New Release batch featured %d releases",
                    featured,
                )
        except Exception:
            logger.exception("New Release refresh failed")


def _fetch_fresh_release_candidates() -> list[FreshReleaseCandidate]:
    """Fetch and filter the week's fresh releases, newest first. Empty on any failure."""
    try:
        response = httpx.get(
            LISTENBRAINZ_FRESH_RELEASES_URL,
            params={
                "days": settings.new_release_refresh_days,
                "past": "true",
                "future": "false",
                "sort": "release_date",
            },
            headers={"User-Agent": MUSICBRAINZ_USER_AGENT},
            timeout=LISTENBRAINZ_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        logger.exception("ListenBrainz fresh releases fetch failed")
        return []

    if not isinstance(payload, dict):
        return []
    releases = payload.get("payload", {})
    if isinstance(releases, dict):
        releases = releases.get("releases", [])
    if not isinstance(releases, list):
        return []

    candidates = []
    for row in releases:
        candidate = _parse_candidate(row)
        if candidate is not None:
            candidates.append(candidate)
    candidates.sort(
        key=lambda candidate: candidate.released_at,
        reverse=True,
    )
    return candidates


def _parse_candidate(row: object) -> FreshReleaseCandidate | None:
    """Parse one ListenBrainz release row into a candidate, or None when unusable."""
    if not isinstance(row, dict):
        return None
    if row.get("release_group_primary_type") not in FEATURED_PRIMARY_TYPES:
        return None
    # Require cover art presence: art-forward card, and a mild distributor-quality proxy.
    if not row.get("caa_id"):
        return None

    release_name = row.get("release_name")
    artist_name = row.get("artist_credit_name")
    release_mbid = row.get("release_mbid")
    release_group_mbid = row.get("release_group_mbid")
    release_date = row.get("release_date")
    if not all(
        isinstance(value, str) and value
        for value in (release_name, artist_name, release_mbid, release_group_mbid, release_date)
    ):
        return None
    try:
        released_at = datetime.strptime(release_date, "%Y-%m-%d").date()
    except ValueError:
        return None

    return FreshReleaseCandidate(
        release_name=release_name,
        artist_name=artist_name,
        release_mbid=release_mbid,
        release_group_mbid=release_group_mbid,
        released_at=released_at,
    )


def _featured_song_payload_from_upc(barcode: str) -> SongCreate | None:
    """
    Resolve a barcode to the release's representative track as an Apple song payload.

    Uses `lookup?upc=...&entity=song`, which returns the collection row followed by its
    tracks; the first track is the feature. None when Apple has no matching catalog entry.
    """
    _wait_for_apple_budget()
    try:
        response = httpx.get(
            APPLE_LOOKUP_URL,
            params={
                "upc": barcode,
                "country": settings.new_release_storefront,
                "entity": "song",
            },
            timeout=APPLE_UPC_LOOKUP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        return None

    track = _first_track_row(results)
    if track is None:
        return None
    try:
        return SongCreate(
            provider="apple",
            apple_track_id=str(track["trackId"]),
            storefront=settings.new_release_storefront,
            title=str(track["trackName"]),
            artist=str(track["artistName"]),
            album=str(track.get("collectionName") or ""),
            cover_url=str(track.get("artworkUrl100") or ""),
            artwork_url=str(track.get("artworkUrl100") or "") or None,
            apple_view_url=str(track.get("trackViewUrl") or "") or None,
            apple_artist_id=str(track.get("artistId") or "") or None,
            apple_album_id=str(track.get("collectionId") or "") or None,
            genre=str(track.get("primaryGenreName") or "") or None,
            duration_ms=track.get("trackTimeMillis") if isinstance(track.get("trackTimeMillis"), int) else None,
            preview_available=isinstance(track.get("previewUrl"), str) or None,
            preview_url=None,
        )
    except (KeyError, ValueError):
        return None


def _first_track_row(results: list) -> dict | None:
    """Return the lowest-numbered song row from an Apple UPC lookup result list."""
    tracks = [
        row
        for row in results
        if isinstance(row, dict)
        and row.get("kind") == "song"
        and row.get("trackId") is not None
        and row.get("trackName")
        and row.get("artistName")
    ]
    if not tracks:
        return None
    tracks.sort(
        key=lambda row: (
            row.get("discNumber") if isinstance(row.get("discNumber"), int) else 1,
            row.get("trackNumber") if isinstance(row.get("trackNumber"), int) else 1,
        ),
    )
    return tracks[0]


def _wait_for_apple_budget() -> None:
    """Throttle batch Apple lookups; interactive finalize lookups are not routed here."""
    global _last_apple_request_at

    now = time.monotonic()
    elapsed = now - _last_apple_request_at
    if elapsed < APPLE_MIN_REQUEST_INTERVAL_SECONDS:
        time.sleep(APPLE_MIN_REQUEST_INTERVAL_SECONDS - elapsed)

    _last_apple_request_at = time.monotonic()
