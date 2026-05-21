# Integration tests for the GET /api/v1/songs/{deezer_id}/preview-url endpoint.
# Tests cover the cache-hit (fresh), cache-miss (expired), DB update, null-preview, and 404 cases.
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.pydantic_schemas.song import SongCreate
from src.services.song import persist_user_touched_song
from src.sqlalchemy_tables.song import Song

REGISTER_PAYLOAD = {
    "email": "user@example.com",
    "password": "password123",
    "display_name": "Test User",
    "username": "testuser",
}

# URLs with exp= tokens that parse to clearly fresh (year 2286) or clearly expired (year 2001) times.
FRESH_URL = "https://e-cdns-preview.dzcdn.net/stream/fresh?exp=9999999999&hdnea=token"
EXPIRED_URL = "https://e-cdns-preview.dzcdn.net/stream/expired?exp=1000000000&hdnea=token"
REFRESHED_URL = "https://e-cdns-preview.dzcdn.net/stream/refreshed?exp=9999999999&hdnea=token"


class MockDeezerTrackResponse:
    """Small httpx.Response stand-in for Deezer track API tests."""

    def __init__(
        self,
        preview: str | None,
    ) -> None:
        self.preview = preview

    def raise_for_status(self) -> None:
        """Match the httpx response API used by the service."""
        return None

    def json(self) -> dict:
        """Return the mocked Deezer track payload."""
        return {"preview": self.preview}


def _get_token(client: TestClient) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post(
        "/api/v1/auth/register",
        json=REGISTER_PAYLOAD,
    )
    return response.json()["access_token"]


def _insert_song(
    db: Session,
    deezer_id: int = 123,
    preview_url: str | None = FRESH_URL,
) -> Song:
    """
    Insert a song into the durable catalog.

    preview_url_expires_at is derived automatically from the exp= token in preview_url,
    so use FRESH_URL for a far-future expiry and EXPIRED_URL for a past expiry.
    """
    persist_user_touched_song(
        db,
        SongCreate(
            deezer_id=deezer_id,
            isrc="USUG11900842",
            title="Nights",
            artist="Frank Ocean",
            artist_deezer_id=456,
            album="Blonde",
            cover_url="https://example.com/cover.jpg",
            preview_url=preview_url,
            genre_deezer=None,
        ),
    )
    return db.execute(
        select(Song)
        .where(Song.deezer_id == deezer_id)
    ).scalar_one()


def test_preview_url_requires_auth(client: TestClient):
    """Fetching a preview URL without a token returns 401."""
    response = client.get("/api/v1/songs/123/preview-url")
    assert response.status_code == 401


def test_preview_url_returns_404_for_unknown_song(client: TestClient):
    """A song not in the durable catalog returns 404."""
    token = _get_token(client)
    response = client.get(
        "/api/v1/songs/99999/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


def test_preview_url_returns_stored_url_when_fresh(
    client: TestClient,
    db_session: Session,
):
    """Stored URL is returned immediately without calling Deezer when its expiry is far in the future."""
    _insert_song(db_session, preview_url=FRESH_URL)
    token = _get_token(client)

    response = client.get(
        "/api/v1/songs/123/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"preview_url": FRESH_URL}


def test_preview_url_calls_deezer_when_expired(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """An expired stored URL triggers a Deezer track API call and the fresh URL is returned."""
    _insert_song(db_session, preview_url=EXPIRED_URL)
    token = _get_token(client)

    def mock_get(url: str, timeout: float) -> MockDeezerTrackResponse:
        assert url == "https://api.deezer.com/track/123"
        return MockDeezerTrackResponse(REFRESHED_URL)

    monkeypatch.setattr("src.services.song.httpx.get", mock_get)

    response = client.get(
        "/api/v1/songs/123/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"preview_url": REFRESHED_URL}


def test_preview_url_updates_db_after_refresh(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """After a Deezer refresh, the new URL and its parsed expiry are persisted to the songs row."""
    _insert_song(db_session, preview_url=EXPIRED_URL)
    token = _get_token(client)

    def mock_get(url: str, timeout: float) -> MockDeezerTrackResponse:
        return MockDeezerTrackResponse(REFRESHED_URL)

    monkeypatch.setattr("src.services.song.httpx.get", mock_get)

    client.get(
        "/api/v1/songs/123/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )

    db_session.expire_all()
    song = db_session.execute(
        select(Song)
        .where(Song.deezer_id == 123)
    ).scalar_one()
    assert song.preview_url == REFRESHED_URL
    # REFRESHED_URL contains exp=9999999999, so expires_at must be set and far in the future.
    assert song.preview_url_expires_at is not None
    assert song.preview_url_expires_at > datetime.now(timezone.utc) + timedelta(days=365)


def test_preview_url_returns_null_when_deezer_has_no_preview(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """A null preview from the Deezer track API is stored and returned as null without error."""
    _insert_song(db_session, preview_url=EXPIRED_URL)
    token = _get_token(client)

    def mock_get(url: str, timeout: float) -> MockDeezerTrackResponse:
        return MockDeezerTrackResponse(None)

    monkeypatch.setattr("src.services.song.httpx.get", mock_get)

    response = client.get(
        "/api/v1/songs/123/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"preview_url": None}


def test_preview_url_falls_back_to_stored_url_when_deezer_call_fails(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """A Deezer outage returns the stored URL instead of surfacing a 500 to the user."""
    _insert_song(db_session, preview_url=EXPIRED_URL)
    token = _get_token(client)

    def mock_get(url: str, timeout: float) -> MockDeezerTrackResponse:
        raise RuntimeError("Deezer unavailable")

    monkeypatch.setattr("src.services.song.httpx.get", mock_get)

    response = client.get(
        "/api/v1/songs/123/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"preview_url": EXPIRED_URL}


def test_preview_url_rate_limit_enforced(
    client: TestClient,
    db_session: Session,
):
    """The preview URL endpoint returns 429 after 60 requests per minute."""
    _insert_song(db_session, preview_url=FRESH_URL)
    token = _get_token(client)
    responses = [
        client.get(
            "/api/v1/songs/123/preview-url",
            headers={"Authorization": f"Bearer {token}"},
        )
        for _ in range(61)
    ]

    assert responses[-1].status_code == 429
