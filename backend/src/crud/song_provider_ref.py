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


def get_song_by_provider_track(
    db: Session,
    provider: str,
    provider_track_id: str,
    storefront: str,
) -> Song | None:
    """Return a durable song by provider reference."""
    row = db.execute(
        select(Song)
        .join(
            SongProviderRef,
            SongProviderRef.song_id == Song.id,
        )
        .where(SongProviderRef.provider == provider)
        .where(SongProviderRef.provider_track_id == provider_track_id)
        .where(SongProviderRef.storefront == storefront)
    ).scalar_one_or_none()
    return row


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
    ]
