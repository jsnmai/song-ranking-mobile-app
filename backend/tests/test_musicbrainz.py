# Tests for MusicBrainz enrichment behavior.
# The HTTP client is mocked so tests never call the real MusicBrainz API.
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.crud.song import list_enrichment_retry_candidates
from src.pydantic_schemas.song import SongCreate
from src.services.musicbrainz import enrich_song_metadata
from src.services.musicbrainz_tasks import run_enrichment_sweep
from src.services.song import persist_user_touched_song
from src.sqlalchemy_tables.artist import Artist, SongArtistCredit
from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.song_provider_ref import SongProviderRef


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
    payload.deezer_id = 880001
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


def test_musicbrainz_no_match_is_not_retried(
    db_session: Session,
    monkeypatch,
):
    """A prior no_match result is terminal for normal enrichment scheduling."""
    payload = _song_payload()
    payload.deezer_id = 880003
    payload.isrc = None
    song_response = persist_user_touched_song(
        db_session,
        payload,
    )

    monkeypatch.setattr(
        "src.services.musicbrainz.httpx.get",
        lambda *args, **kwargs: LowConfidenceMusicBrainzResponse(),
    )
    monkeypatch.setattr(
        "src.services.musicbrainz.time.sleep",
        lambda seconds: None,
    )

    first = enrich_song_metadata(
        db_session,
        song_response.id,
    )
    assert first is not None
    assert first.metadata_enriched_at is None

    def fail_if_called(
        url: str,
        params: dict,
        headers: dict,
        timeout: float,
    ) -> MockMusicBrainzResponse:
        raise AssertionError("MusicBrainz should not be called again for no_match songs.")

    monkeypatch.setattr(
        "src.services.musicbrainz.httpx.get",
        fail_if_called,
    )

    second = enrich_song_metadata(
        db_session,
        song_response.id,
    )

    assert second is not None
    assert second.metadata_enriched_at is None
    db_session.expire_all()
    song = db_session.get(Song, song_response.id)
    assert song is not None
    assert song.enrichment_status == "no_match"
    assert song.enrichment_attempt_count == 1


def test_musicbrainz_http_failure_writes_failed_temporary_status(
    db_session: Session,
    monkeypatch,
):
    """A MusicBrainz HTTP error sets enrichment_status to failed_temporary and re-raises."""
    payload = _song_payload()
    payload.deezer_id = 880002
    song_response = persist_user_touched_song(
        db_session,
        payload,
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


def test_bookmark_schedules_musicbrainz_enrichment(
    client: TestClient,
    monkeypatch,
) -> None:
    """Bookmarking is a durable song action, so it schedules best-effort enrichment."""
    scheduled_song_ids: list[int] = []

    def record_enrichment_task(song_id: int) -> None:
        scheduled_song_ids.append(song_id)

    monkeypatch.setattr(
        "src.api_routers.bookmarks.enrich_song_metadata_task",
        record_enrichment_task,
    )

    token = _register_and_get_token(
        client,
        email="bookmark-mb@example.com",
        username="bookmarkmb",
    )
    response = client.post(
        "/api/v1/bookmarks",
        json={
            "song": _finalize_payload()["song"],
            "source": "song_detail",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert scheduled_song_ids == [response.json()["song"]["id"]]


class HarvestMusicBrainzResponse:
    """A confident fuzzy match carrying the full identity harvest surface."""

    def raise_for_status(self) -> None:
        """Match the httpx response API used by the service."""
        return None

    def json(self) -> dict:
        """Return one high-confidence recording with artist credit and release identity."""
        return {
            "recordings": [
                {
                    "id": "89ad4ac3-39f7-470e-963a-56509c546377",
                    "score": 97,
                    "first-release-date": "2016-08-20",
                    "artist-credit": [
                        {
                            "artist": {
                                "id": "e520459c-dff4-491d-a6e4-c97be35e0044",
                                "name": "Frank Ocean",
                            },
                        },
                    ],
                    "releases": [
                        {
                            "id": "10c17dfb-a4b3-4a09-a361-2f4390fdf3ff",
                            "track-count": 17,
                            "release-group": {
                                "id": "825cd340-6c85-31ba-b83a-4a22d9d84d36",
                                "primary-type": "Album",
                            },
                            "media": [
                                {
                                    "track-offset": 8,
                                    "track-count": 17,
                                },
                            ],
                        },
                    ],
                    "tags": [
                        {
                            "name": "alternative r&b",
                            "count": 8,
                        },
                    ],
                },
            ],
        }


class IsrcLookupResponse:
    """The recording lookup payload used for ISRC harvesting."""

    def raise_for_status(self) -> None:
        """Match the httpx response API used by the service."""
        return None

    def json(self) -> dict:
        """Return the recording's ISRC list."""
        return {
            "id": "89ad4ac3-39f7-470e-963a-56509c546377",
            "isrcs": ["USUG11600842"],
        }


def test_musicbrainz_fuzzy_enrichment_harvests_identity_and_isrc(
    db_session: Session,
    monkeypatch,
):
    """A confident fuzzy match harvests MBIDs, track placement, ISRC, and writes a provider ref."""
    payload = _song_payload()
    payload.deezer_id = 880010
    payload.isrc = None
    song_response = persist_user_touched_song(
        db_session,
        payload,
    )

    calls: list[tuple[str, dict]] = []

    def mock_get(
        url: str,
        params: dict,
        headers: dict,
        timeout: float,
    ):
        calls.append((url, params))
        if "query" in params:
            return HarvestMusicBrainzResponse()
        assert url.endswith("/89ad4ac3-39f7-470e-963a-56509c546377")
        assert params == {"inc": "isrcs", "fmt": "json"}
        return IsrcLookupResponse()

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
    assert response.isrc == "USUG11600842"
    assert len(calls) == 2

    db_session.expire_all()
    song = db_session.get(Song, song_response.id)
    assert song is not None
    assert song.artist_mbid == "e520459c-dff4-491d-a6e4-c97be35e0044"
    assert song.release_group_mbid == "825cd340-6c85-31ba-b83a-4a22d9d84d36"
    # media track-offset is 0-based; position is 1-based.
    assert song.track_position == 9
    assert song.track_count == 17

    provider_ref = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "musicbrainz")
        .where(SongProviderRef.song_id == song.id)
    ).scalar_one()
    assert provider_ref.provider_track_id == "89ad4ac3-39f7-470e-963a-56509c546377"
    assert provider_ref.provider_artist_id == "e520459c-dff4-491d-a6e4-c97be35e0044"
    assert provider_ref.provider_album_id == "825cd340-6c85-31ba-b83a-4a22d9d84d36"
    assert provider_ref.storefront == "global"
    assert provider_ref.confidence == "mb_fuzzy"

    artist = db_session.execute(
        select(Artist)
        .where(Artist.musicbrainz_id == "e520459c-dff4-491d-a6e4-c97be35e0044")
    ).scalar_one()
    credit = db_session.execute(
        select(SongArtistCredit)
        .where(SongArtistCredit.song_id == song.id)
    ).scalar_one()
    assert artist.name == "Frank Ocean"
    assert credit.artist_id == artist.id
    assert credit.position == 1
    assert credit.credited_name == "Frank Ocean"
    assert credit.source == "musicbrainz"
    assert credit.confidence == "mb_fuzzy"
    assert song.artist_credits_enriched_at is not None


class ArtistCreditLookupResponse:
    """The recording lookup payload used to backfill structured artist credits."""

    def raise_for_status(self) -> None:
        """Match the httpx response API used by the service."""
        return None

    def json(self) -> dict:
        """Return ordered collaborator credits."""
        return {
            "id": "fuze-recording",
            "artist-credit": [
                {
                    "name": "Skrillex",
                    "joinphrase": " & ",
                    "artist": {
                        "id": "ae002c5d-aac6-4900-a39a-30aa9e2edf2b",
                        "name": "Skrillex",
                    },
                },
                {
                    "name": "ISOxo",
                    "artist": {
                        "id": "b768ec2f-5e65-4fd8-b87a-6ad8f7f1c999",
                        "name": "ISOxo",
                    },
                },
            ],
        }


def test_musicbrainz_artist_credit_backfill_for_already_enriched_song(
    db_session: Session,
    monkeypatch,
):
    """Existing enriched songs with a recording MBID can refresh only artist-credit rows."""
    payload = _song_payload()
    payload.deezer_id = 880011
    payload.title = "fuze"
    payload.artist = "Skrillex & ISOxo"
    song_response = persist_user_touched_song(
        db_session,
        payload,
    )
    song = db_session.get(Song, song_response.id)
    assert song is not None
    song.musicbrainz_id = "fuze-recording"
    song.metadata_enriched_at = datetime.now(timezone.utc)
    song.enrichment_status = "enriched"
    db_session.commit()

    calls: list[tuple[str, dict]] = []

    def mock_get(
        url: str,
        params: dict,
        headers: dict,
        timeout: float,
    ) -> ArtistCreditLookupResponse:
        calls.append((url, params))
        assert url.endswith("/fuze-recording")
        assert params == {"inc": "artist-credits", "fmt": "json"}
        return ArtistCreditLookupResponse()

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
    assert len(calls) == 1
    db_session.expire_all()
    refreshed_song = db_session.get(Song, song_response.id)
    assert refreshed_song is not None
    assert refreshed_song.artist_credits_enriched_at is not None

    credits = db_session.execute(
        select(SongArtistCredit)
        .where(SongArtistCredit.song_id == song_response.id)
        .order_by(SongArtistCredit.position)
    ).scalars().all()
    assert [credit.credited_name for credit in credits] == ["Skrillex", "ISOxo"]
    assert [credit.join_phrase for credit in credits] == ["&", None]


def test_musicbrainz_isrc_enrichment_keeps_isrc_and_skips_lookup(
    db_session: Session,
    monkeypatch,
):
    """An ISRC-keyed match never overwrites the provider ISRC or spends a lookup call."""
    song_response = persist_user_touched_song(
        db_session,
        _song_payload(),
    )

    call_count = 0

    def mock_get(
        url: str,
        params: dict,
        headers: dict,
        timeout: float,
    ) -> MockMusicBrainzResponse:
        nonlocal call_count
        call_count += 1
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
    assert response.isrc == "USUG11900842"
    assert call_count == 1

    provider_ref = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "musicbrainz")
        .where(SongProviderRef.song_id == song_response.id)
    ).scalar_one()
    assert provider_ref.confidence == "mb_isrc"


def test_list_enrichment_retry_candidates_selects_and_orders(
    db_session: Session,
):
    """Only pending/failed_temporary songs under the attempt cap are retryable, least-attempted first."""
    def make_song(deezer_id: int) -> Song:
        payload = _song_payload()
        payload.deezer_id = deezer_id
        payload.isrc = None
        response = persist_user_touched_song(db_session, payload)
        return db_session.get(Song, response.id)

    pending = make_song(880020)
    failed = make_song(880021)
    failed.enrichment_status = "failed_temporary"
    failed.enrichment_attempt_count = 2
    no_match = make_song(880022)
    no_match.enrichment_status = "no_match"
    no_match.enrichment_attempt_count = 1
    enriched = make_song(880023)
    enriched.enrichment_status = "enriched"
    enriched.metadata_enriched_at = datetime.now(timezone.utc)
    credit_refresh = make_song(880025)
    credit_refresh.enrichment_status = "enriched"
    credit_refresh.metadata_enriched_at = datetime.now(timezone.utc)
    credit_refresh.musicbrainz_id = "credit-refresh-recording"
    credit_done = make_song(880026)
    credit_done.enrichment_status = "enriched"
    credit_done.metadata_enriched_at = datetime.now(timezone.utc)
    credit_done.musicbrainz_id = "credit-done-recording"
    credit_done.artist_credits_enriched_at = datetime.now(timezone.utc)
    # Enriched song that only matched after many search attempts (attempt_count over the cap).
    # It holds a confident recording id, so its artist-credit backfill must not be blocked by the
    # metadata attempt cap — otherwise collaborations like "fuze" would never get split.
    credit_refresh_capped = make_song(880027)
    credit_refresh_capped.enrichment_status = "enriched"
    credit_refresh_capped.metadata_enriched_at = datetime.now(timezone.utc)
    credit_refresh_capped.musicbrainz_id = "credit-refresh-capped-recording"
    credit_refresh_capped.enrichment_attempt_count = 17
    capped = make_song(880024)
    capped.enrichment_status = "failed_temporary"
    capped.enrichment_attempt_count = 5
    db_session.flush()

    candidates = list_enrichment_retry_candidates(
        db_session,
        limit=10,
        max_attempts=5,
    )
    candidate_ids = [song.id for song in candidates]

    assert pending.id in candidate_ids
    assert failed.id in candidate_ids
    assert no_match.id not in candidate_ids
    assert enriched.id not in candidate_ids
    assert credit_refresh.id in candidate_ids
    assert credit_refresh_capped.id in candidate_ids
    assert credit_done.id not in candidate_ids
    assert capped.id not in candidate_ids
    # Least-attempted first.
    assert candidate_ids.index(pending.id) < candidate_ids.index(failed.id)

    capped_list = list_enrichment_retry_candidates(
        db_session,
        limit=1,
        max_attempts=5,
    )
    assert len(capped_list) == 1


def test_run_enrichment_sweep_dispatches_retryable_songs(
    db_session: Session,
    monkeypatch,
):
    """The sweep re-attempts stuck songs through the standard task wrapper."""
    payload = _song_payload()
    payload.deezer_id = 880030
    payload.isrc = None
    response = persist_user_touched_song(db_session, payload)
    song = db_session.get(Song, response.id)
    song.enrichment_status = "failed_temporary"
    song.enrichment_attempt_count = 1
    db_session.commit()

    attempted: list[int] = []
    monkeypatch.setattr(
        "src.services.musicbrainz_tasks.enrich_song_metadata_task",
        lambda song_id: attempted.append(song_id),
    )

    count = run_enrichment_sweep()

    assert response.id in attempted
    assert count == len(attempted)
