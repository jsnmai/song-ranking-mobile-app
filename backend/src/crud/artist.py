"""Database helpers for normalized artist credits."""
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.artist import Artist, SongArtistCredit
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class ArtistCreditData:
    """Structured artist-credit data harvested from a trusted metadata source."""

    name: str
    musicbrainz_id: str
    position: int
    join_phrase: str | None = None


def replace_song_artist_credits(
    db: Session,
    song: Song,
    credits: list[ArtistCreditData],
    source: str,
    confidence: str,
) -> None:
    """Replace a song's structured artist credits with source-backed rows."""
    db.execute(
        delete(SongArtistCredit)
        .where(SongArtistCredit.song_id == song.id)
    )
    db.flush()

    seen_artist_ids: set[int] = set()
    for credit in credits:
        artist = _get_or_create_musicbrainz_artist(
            db,
            name=credit.name,
            musicbrainz_id=credit.musicbrainz_id,
        )
        if artist.id in seen_artist_ids:
            continue
        seen_artist_ids.add(artist.id)
        db.add(
            SongArtistCredit(
                song_id=song.id,
                artist_id=artist.id,
                position=credit.position,
                credited_name=credit.name,
                join_phrase=credit.join_phrase,
                source=source,
                confidence=confidence,
            )
        )


def _get_or_create_musicbrainz_artist(
    db: Session,
    name: str,
    musicbrainz_id: str,
) -> Artist:
    """Return the artist row for a MusicBrainz MBID, refreshing its display name."""
    artist = db.execute(
        select(Artist)
        .where(Artist.musicbrainz_id == musicbrainz_id)
    ).scalar_one_or_none()
    if artist is not None:
        if artist.name != name:
            artist.name = name
        return artist

    artist = Artist(
        name=name,
        musicbrainz_id=musicbrainz_id,
    )
    db.add(artist)
    db.flush()
    return artist
