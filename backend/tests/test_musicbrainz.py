# Tests for MusicBrainz enrichment behavior.
# The HTTP client is mocked so tests never call the real MusicBrainz API.
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.pydantic_schemas.song import SongCreate
from src.services.musicbrainz import enrich_song_metadata
from src.services.song import persist_user_touched_song
from src.sqlalchemy_tables.song import Song


class MockMusicBrainzResponse:
    """Small httpx.Response stand-in for MusicBrainz enrichment tests."""

    def raise_for_status(self) -> None:
        """Match the httpx response API used by the service."""
        return None

    def json(self) -> dict:
        """Return one MusicBrainz recording with tags and release year."""
        return {
            "recordings": [
                {
                    "id": "89ad4ac3-39f7-470e-963a-56509c546377",
                    "first-release-date": "2016-08-20",
                    "tags": [
                        {
                            "name": "alternative r&b",
                            "count": 8,
                        },
                        {
                            "name": "art pop",
                            "count": 3,
                        },
                    ],
                },
            ],
        }


class LowConfidenceMusicBrainzResponse:
    """MusicBrainz response with a fuzzy match below LISTn's confidence threshold."""

    def raise_for_status(self) -> None:
        """Match the httpx response API used by the service."""
        return None

    def json(self) -> dict:
        """Return one low-confidence fuzzy recording."""
        return {
            "recordings": [
                {
                    "id": "bad-match",
                    "score": 72,
                    "first-release-date": "1999-01-01",
                    "tags": [
                        {
                            "name": "wrong genre",
                            "count": 10,
                        },
                    ],
                },
            ],
        }


def _song_payload() -> SongCreate:
    """Return a valid song payload with an ISRC for MusicBrainz lookup."""
    return SongCreate(
        deezer_id=123,
        isrc="USUG11900842",
        title="Nights",
        artist="Frank Ocean",
        artist_deezer_id=456,
        album="Blonde",
        cover_url="https://example.com/cover.jpg",
        preview_url="https://example.com/preview.mp3",
        genre_deezer=None,
    )


def test_musicbrainz_enrichment_skips_already_enriched_song(
    db_session: Session,
    monkeypatch,
):
    """Already-enriched songs do not call MusicBrainz again."""
    song_response = persist_user_touched_song(
        db_session,
        _song_payload(),
    )
    song = db_session.get(
        Song,
        song_response.id,
    )
    assert song is not None
    song.metadata_enriched_at = datetime.now(timezone.utc)
    db_session.commit()

    def fail_if_called(
        url: str,
        params: dict,
        headers: dict,
        timeout: float,
    ) -> MockMusicBrainzResponse:
        raise AssertionError("MusicBrainz should not be called for enriched songs.")

    monkeypatch.setattr(
        "src.services.musicbrainz.httpx.get",
        fail_if_called,
    )

    response = enrich_song_metadata(
        db_session,
        song_response.id,
    )

    assert response is not None
    assert response.metadata_enriched_at is not None


def test_musicbrainz_enrichment_by_isrc_updates_song(
    db_session: Session,
    monkeypatch,
):
    """ISRC enrichment stores MusicBrainz ID, genres, release year, and timestamp."""
    song_response = persist_user_touched_song(
        db_session,
        _song_payload(),
    )

    def mock_get(
        url: str,
        params: dict,
        headers: dict,
        timeout: float,
    ) -> MockMusicBrainzResponse:
        assert url == "https://musicbrainz.org/ws/2/recording/"
        assert params == {
            "query": "isrc:USUG11900842",
            "fmt": "json",
        }
        assert headers == {"User-Agent": "LISTn/1.0 (contact@listn.app)"}
        assert timeout == 8.0
        return MockMusicBrainzResponse()

    monkeypatch.setattr(
        "src.services.musicbrainz.httpx.get",
        mock_get,
    )
    monkeypatch.setattr(
        "src.services.musicbrainz.time.sleep",
        lambda seconds: None,
    )

    response = enrich_song_metadata(
        db_session,
        song_response.id,
    )

    assert response is not None
    assert response.musicbrainz_id == "89ad4ac3-39f7-470e-963a-56509c546377"
    assert response.genres_mb == ["alternative r&b", "art pop"]
    assert response.release_year == 2016
    assert response.metadata_enriched_at is not None

    song = db_session.get(Song, song_response.id)
    assert song is not None
    assert song.enrichment_status == "enriched"
    assert song.enrichment_attempt_count == 1


def test_musicbrainz_fuzzy_match_below_threshold_is_skipped(
    db_session: Session,
    monkeypatch,
):
    """Low-confidence fuzzy matches are not stored as authoritative metadata."""
    payload = _song_payload()
    payload.isrc = None
    song_response = persist_user_touched_song(
        db_session,
        payload,
    )

    def mock_get(
        url: str,
        params: dict,
        headers: dict,
        timeout: float,
    ) -> LowConfidenceMusicBrainzResponse:
        assert params == {
            "query": 'artist:"Frank Ocean" AND recording:"Nights"',
            "fmt": "json",
        }
        return LowConfidenceMusicBrainzResponse()

    monkeypatch.setattr(
        "src.services.musicbrainz.httpx.get",
        mock_get,
    )
    monkeypatch.setattr(
        "src.services.musicbrainz.time.sleep",
        lambda seconds: None,
    )

    response = enrich_song_metadata(
        db_session,
        song_response.id,
    )

    assert response is not None
    assert response.musicbrainz_id is None
    assert response.genres_mb is None
    assert response.release_year is None
    assert response.metadata_enriched_at is None

    song = db_session.get(Song, song_response.id)
    assert song is not None
    assert song.enrichment_status == "no_match"
    assert song.enrichment_attempt_count == 1


def test_musicbrainz_http_failure_writes_failed_temporary_status(
    db_session: Session,
    monkeypatch,
):
    """A MusicBrainz HTTP error sets enrichment_status to failed_temporary and re-raises."""
    song_response = persist_user_touched_song(
        db_session,
        _song_payload(),
    )

    monkeypatch.setattr(
        "src.services.musicbrainz.httpx.get",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            httpx.ConnectError("simulated failure"),
        ),
    )
    monkeypatch.setattr(
        "src.services.musicbrainz.time.sleep",
        lambda seconds: None,
    )

    with pytest.raises(httpx.ConnectError):
        enrich_song_metadata(db_session, song_response.id)

    db_session.expire_all()
    song = db_session.get(Song, song_response.id)
    assert song is not None
    assert song.enrichment_status == "failed_temporary"
    assert song.enrichment_attempt_count == 1


def _register_and_get_token(
    client: TestClient,
    email: str = "mb@example.com",
    username: str = "mbuser",
) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": "MB User",
            "username": username,
        },
    )
    return response.json()["access_token"]


def _finalize_payload() -> dict:
    """Return a valid rating finalize request body."""
    return {
        "song": {
            "deezer_id": 9999,
            "isrc": "USUG11900842",
            "title": "Nights",
            "artist": "Frank Ocean",
            "artist_deezer_id": 456,
            "album": "Blonde",
            "cover_url": "https://example.com/cover.jpg",
            "preview_url": None,
            "genre_deezer": None,
        },
        "bucket": "dislike",
    }


def test_rating_finalize_succeeds_when_musicbrainz_raises(
    client: TestClient,
    monkeypatch,
) -> None:
    """Rating finalize returns 201 even when MusicBrainz enrichment throws an exception."""
    def fail_enrichment(
        db: Session,
        song_id: int,
    ) -> None:
        raise RuntimeError("MusicBrainz is down")

    # Patch the reference used inside the background task module so the task's
    # try/except catches the error and the HTTP response is unaffected.
    monkeypatch.setattr(
        "src.services.musicbrainz_tasks.enrich_song_metadata",
        fail_enrichment,
    )

    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/ratings/finalize",
        json=_finalize_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["ranking"]["bucket"] == "dislike"
