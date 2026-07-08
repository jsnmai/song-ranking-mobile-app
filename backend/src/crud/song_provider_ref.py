"""Database access layer for song provider references."""
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.song_provider_ref import SongProviderRef


@dataclass(frozen=True)
class ProviderRankingRow:
    """A provider reference paired with optional current-user rating state."""

    provider_ref: SongProviderRef
    ranking: Ranking | None


def is_untrusted_legacy_apple_ref(ref: SongProviderRef) -> bool:
    """
    Return True for Apple refs written by the old search fallback without provider facts.

    Those rows were created from title/artist matches during read-only search annotation, so
    they can point at unrelated compilation or remix tracks. Refs created from a finalize
    action carry provider facts such as a store URL or preview availability and remain usable.
    """
    return (
        ref.provider == "apple"
        and ref.confidence == "apple_legacy_fallback_match"
        and ref.url is None
        and ref.preview_available is None
    )


def get_by_provider_track(
    db: Session,
    provider: str,
    provider_track_id: str,
    storefront: str,
) -> SongProviderRef | None:
    """Return a provider reference for one provider track/storefront."""
    return db.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == provider)
        .where(SongProviderRef.provider_track_id == provider_track_id)
        .where(SongProviderRef.storefront == storefront)
    ).scalar_one_or_none()


def delete_provider_ref(
    db: Session,
    provider_ref: SongProviderRef,
) -> None:
    """Delete one stale provider ref without committing."""
    db.delete(provider_ref)
    db.flush()


def get_song_provider_ref(
    db: Session,
    song_id: int,
    provider: str,
) -> SongProviderRef | None:
    """Return one provider reference for a durable song, or None.

    A song can hold more than one ref for the same provider — different storefronts, or a
    duplicate left behind by a matching sweep — since the unique constraint is on
    (provider, provider_track_id, storefront), not (song_id, provider). Take the most
    recently matched ref rather than asserting exactly one, which would 500 on dupes.
    """
    refs = db.execute(
        select(SongProviderRef)
        .where(SongProviderRef.song_id == song_id)
        .where(SongProviderRef.provider == provider)
    ).scalars().all()
    refs = [
        ref
        for ref in refs
        if not is_untrusted_legacy_apple_ref(ref)
    ]
    if not refs:
        return None
    return max(refs, key=_provider_ref_priority)


def list_apple_provider_refs_for_songs(
    db: Session,
    song_ids: list[int],
) -> dict[int, SongProviderRef]:
    """Return Apple provider refs for a batch of durable songs keyed by song_id."""
    unique_song_ids = list(dict.fromkeys(song_ids))
    if not unique_song_ids:
        return {}

    refs = db.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "apple")
        .where(SongProviderRef.song_id.in_(unique_song_ids))
    ).scalars().all()
    selected: dict[int, SongProviderRef] = {}
    for ref in refs:
        if is_untrusted_legacy_apple_ref(ref):
            continue
        current = selected.get(ref.song_id)
        if current is None or _provider_ref_priority(ref) > _provider_ref_priority(current):
            selected[ref.song_id] = ref
    return selected


def _provider_ref_priority(ref: SongProviderRef) -> tuple[bool, bool, datetime, int]:
    """Prefer useful preview refs over later fallback identity refs for one song/provider."""
    matched_at = ref.matched_at or datetime.min.replace(tzinfo=timezone.utc)
    return (
        ref.preview_available is True,
        ref.url is not None,
        matched_at,
        ref.id,
    )


def get_song_by_provider_track(
    db: Session,
    provider: str,
    provider_track_id: str,
    storefront: str,
) -> Song | None:
    """Return a durable song by provider reference."""
    row = db.execute(
        select(
            Song,
            SongProviderRef,
        )
        .join(
            SongProviderRef,
            SongProviderRef.song_id == Song.id,
        )
        .where(SongProviderRef.provider == provider)
        .where(SongProviderRef.provider_track_id == provider_track_id)
        .where(SongProviderRef.storefront == storefront)
    ).one_or_none()
    if row is None:
        return None
    song, provider_ref = row
    if is_untrusted_legacy_apple_ref(provider_ref):
        return None
    return song


def create_provider_ref(
    db: Session,
    song_id: int,
    provider: str,
    provider_track_id: str,
    provider_artist_id: str | None,
    provider_album_id: str | None,
    storefront: str,
    url: str | None,
    artwork_url: str | None,
    preview_available: bool | None,
    confidence: str | None,
) -> SongProviderRef:
    """Create one provider reference without committing."""
    provider_ref = SongProviderRef(
        song_id=song_id,
        provider=provider,
        provider_track_id=provider_track_id,
        provider_artist_id=provider_artist_id,
        provider_album_id=provider_album_id,
        storefront=storefront,
        url=url,
        artwork_url=artwork_url,
        preview_available=preview_available,
        confidence=confidence,
        matched_at=datetime.now(timezone.utc),
    )
    db.add(provider_ref)
    db.flush()
    return provider_ref


def ensure_musicbrainz_ref(
    db: Session,
    song: Song,
    recording_mbid: str,
    artist_mbid: str | None,
    release_group_mbid: str | None,
    confidence: str,
) -> None:
    """Stage a MusicBrainz provider ref for an enriched song, idempotently."""
    statement = (
        insert(SongProviderRef)
        .values(
            song_id=song.id,
            provider="musicbrainz",
            provider_track_id=recording_mbid,
            provider_artist_id=artist_mbid,
            provider_album_id=release_group_mbid,
            storefront="global",
            url=None,
            artwork_url=None,
            preview_available=None,
            confidence=confidence,
            matched_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_nothing(
            constraint="uq_song_provider_refs_provider_track_storefront",
        )
    )
    db.execute(statement)
    db.flush()


def ensure_apple_ref(
    db: Session,
    song: Song,
    apple_track_id: str,
    storefront: str,
    provider_artist_id: str | None,
    provider_album_id: str | None,
    url: str | None,
    artwork_url: str | None,
    preview_available: bool | None,
    confidence: str,
) -> None:
    """Attach a missing Apple provider ref to an already-known song, idempotently.

    Callers must only invoke this when no ref exists yet for (apple, apple_track_id,
    storefront) — the unique constraint means a second ref can never attach to the same
    Apple track, so calling this when one already exists would just silently no-op.
    """
    statement = (
        insert(SongProviderRef)
        .values(
            song_id=song.id,
            provider="apple",
            provider_track_id=apple_track_id,
            provider_artist_id=provider_artist_id,
            provider_album_id=provider_album_id,
            storefront=storefront,
            url=url,
            artwork_url=artwork_url,
            preview_available=preview_available,
            confidence=confidence,
            matched_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_nothing(
            constraint="uq_song_provider_refs_provider_track_storefront",
        )
    )
    db.execute(statement)
    db.flush()


def ensure_deezer_legacy_ref(
    db: Session,
    song: Song,
) -> None:
    """Backfill or stage a Deezer legacy provider ref for an existing song."""
    if song.deezer_id is None:
        return
    statement = (
        insert(SongProviderRef)
        .values(
            song_id=song.id,
            provider="deezer_legacy",
            provider_track_id=str(song.deezer_id),
            provider_artist_id=str(song.artist_deezer_id) if song.artist_deezer_id is not None else None,
            provider_album_id=None,
            storefront="global",
            url=None,
            artwork_url=song.cover_url,
            preview_available=song.preview_url is not None,
            confidence="deezer_legacy",
            matched_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_nothing(
            constraint="uq_song_provider_refs_provider_track_storefront",
        )
    )
    db.execute(statement)
    db.flush()


def list_provider_rating_annotations(
    db: Session,
    user_id: int,
    provider: str,
    provider_tracks: list[tuple[str, str]],
) -> list[ProviderRankingRow]:
    """Return provider refs and current-user ratings for a batch of provider tracks."""
    if not provider_tracks:
        return []

    conditions = [
        (provider_track_id, storefront)
        for provider_track_id, storefront in provider_tracks
    ]
    rows = db.execute(
        select(
            SongProviderRef,
            Ranking,
        )
        .outerjoin(
            Ranking,
            (Ranking.song_id == SongProviderRef.song_id)
            & (Ranking.user_id == user_id),
        )
        .where(SongProviderRef.provider == provider)
        .where(
            tuple_(
                SongProviderRef.provider_track_id,
                SongProviderRef.storefront,
            ).in_(conditions)
        )
    ).all()
    return [
        ProviderRankingRow(
            provider_ref=row[0],
            ranking=row[1],
        )
        for row in rows
        if not is_untrusted_legacy_apple_ref(row[0])
    ]
