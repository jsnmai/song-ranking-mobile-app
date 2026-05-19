# Tests for durable song persistence.
# Search is transient; these tests cover the service future rating/bookmark flows will use.
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.pydantic_schemas.song import SongCreate
from src.services.song import persist_user_touched_song
from src.sqlalchemy_tables.song import Song


def _song_payload(
    deezer_id: int = 123,
    isrc: str | None = "USUG11900842",
) -> SongCreate:
    """Return a valid song payload shaped like a normalized Deezer result."""
    return SongCreate(
        deezer_id=deezer_id,
        isrc=isrc,
        title="Nights",
        artist="Frank Ocean",
        artist_deezer_id=456,
        album="Blonde",
        cover_url="https://example.com/cover.jpg",
        preview_url="https://example.com/preview.mp3",
        genre_deezer=None,
    )


def test_persist_user_touched_song_inserts_song(db_session: Session):
    """A user-touched song is persisted with Deezer metadata."""
    response = persist_user_touched_song(
        db_session,
        _song_payload(),
    )

    assert response.id is not None
    assert response.deezer_id == 123
    assert response.isrc == "USUG11900842"
    assert response.title == "Nights"
    assert response.metadata_enriched_at is None


def test_persist_user_touched_song_is_idempotent_by_deezer_id(db_session: Session):
    """Touching the same Deezer song twice returns one durable row."""
    first_response = persist_user_touched_song(
        db_session,
        _song_payload(),
    )
    second_response = persist_user_touched_song(
        db_session,
        _song_payload(),
    )

    assert second_response.id == first_response.id
    assert db_session.scalar(select(func.count()).select_from(Song)) == 1


def test_persist_user_touched_song_allows_nullable_isrc(db_session: Session):
    """Deezer occasionally omits ISRC, so persistence must not require it."""
    response = persist_user_touched_song(
        db_session,
        _song_payload(
            deezer_id=456,
            isrc=None,
        ),
    )

    assert response.deezer_id == 456
    assert response.isrc is None


def test_persist_user_touched_song_allows_large_deezer_id(db_session: Session):
    """Deezer track IDs can exceed PostgreSQL's 32-bit integer range."""
    response = persist_user_touched_song(
        db_session,
        _song_payload(
            deezer_id=3_993_449_551,
        ),
    )

    assert response.deezer_id == 3_993_449_551
