# Integration tests for the song search endpoint.
# Deezer is mocked so tests cover LISTn behavior without external network calls.
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.user import User

REGISTER_PAYLOAD = {
    "email": "user@example.com",
    "password": "password123",
    "birthdate": "2000-01-01",
    "display_name": "Test User",
    "username": "testuser",
}


class MockDeezerResponse:
    """Small httpx.Response stand-in for Deezer search tests."""

    def __init__(
        self,
        payload: dict,
    ) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        """Match the httpx response API used by the service."""
        return None

    def json(self) -> dict:
        """Return the mocked Deezer payload."""
        return self.payload


def _get_token(client: TestClient) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post(
        "/api/v1/auth/register",
        json=REGISTER_PAYLOAD,
    )
    return response.json()["access_token"]


def _mock_successful_deezer_search(monkeypatch) -> None:
    """Replace httpx.get with a deterministic Deezer search response."""
    def mock_get(
        url: str,
        params: dict,
        timeout: float,
    ) -> MockDeezerResponse:
        assert url == "https://api.deezer.com/search"
        assert params["q"] == "ocean"
        assert params["limit"] == 10
        assert timeout == 5.0
        return MockDeezerResponse(
            {
                "data": [
                    {
                        "id": 123,
                        "isrc": "USUG11900842",
                        "title": "Nights",
                        "artist": {
                            "id": 456,
                            "name": "Frank Ocean",
                        },
                        "album": {
                            "title": "Blonde",
                            "cover_medium": "https://example.com/cover.jpg",
                        },
                        "preview": "https://example.com/preview.mp3",
                    },
                ],
            }
        )

    monkeypatch.setattr(
        "src.services.search.httpx.get",
        mock_get,
    )


def test_search_requires_auth(client: TestClient):
    """Searching without a token returns 401."""
    response = client.get("/api/v1/search/songs?q=ocean")
    assert response.status_code == 401


def test_search_query_too_short(client: TestClient):
    """Search rejects short queries before calling Deezer."""
    token = _get_token(client)
    response = client.get(
        "/api/v1/search/songs?q=o",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


def test_search_missing_query_rejected(client: TestClient):
    """Search requires a query string."""
    token = _get_token(client)
    response = client.get(
        "/api/v1/search/songs",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


def test_search_returns_normalized_results(client: TestClient, monkeypatch):
    """Search returns LISTn's stable DTO shape, not raw Deezer JSON."""
    token = _get_token(client)
    _mock_successful_deezer_search(monkeypatch)

    response = client.get(
        "/api/v1/search/songs?q=ocean",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "results": [
            {
                "deezer_id": 123,
                "isrc": "USUG11900842",
                "title": "Nights",
                "artist": "Frank Ocean",
                "artist_deezer_id": 456,
                "album": "Blonde",
                "cover_url": "https://example.com/cover.jpg",
                "preview_url": "https://example.com/preview.mp3",
            },
        ],
    }
    assert "data" not in body


def test_search_deezer_failure_returns_safe_error(client: TestClient, monkeypatch):
    """Deezer network failures return a safe 502 without provider internals."""
    import httpx

    token = _get_token(client)

    def mock_get(
        url: str,
        params: dict,
        timeout: float,
    ) -> MockDeezerResponse:
        raise httpx.RequestError("provider exploded")

    monkeypatch.setattr(
        "src.services.search.httpx.get",
        mock_get,
    )

    response = client.get(
        "/api/v1/search/songs?q=ocean",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Song search is temporarily unavailable."


def test_search_bad_deezer_payload_returns_safe_error(client: TestClient, monkeypatch):
    """Unexpected Deezer response shape returns a safe 502."""
    token = _get_token(client)

    def mock_get(
        url: str,
        params: dict,
        timeout: float,
    ) -> MockDeezerResponse:
        return MockDeezerResponse({"unexpected": []})

    monkeypatch.setattr(
        "src.services.search.httpx.get",
        mock_get,
    )

    response = client.get(
        "/api/v1/search/songs?q=ocean",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Song search is temporarily unavailable."


def test_search_skips_malformed_deezer_rows(client: TestClient, monkeypatch):
    """One malformed provider row does not fail the whole search."""
    token = _get_token(client)

    def mock_get(
        url: str,
        params: dict,
        timeout: float,
    ) -> MockDeezerResponse:
        return MockDeezerResponse(
            {
                "data": [
                    {
                        "id": 123,
                        "title": "Missing Artist",
                        "album": {"title": "No Artist"},
                    },
                    {
                        "id": 456,
                        "isrc": None,
                        "title": "Good Song",
                        "artist": {
                            "id": 789,
                            "name": "Good Artist",
                        },
                        "album": {
                            "title": "Good Album",
                            "cover": "https://example.com/fallback-cover.jpg",
                        },
                        "preview": "",
                    },
                ],
            }
        )

    monkeypatch.setattr(
        "src.services.search.httpx.get",
        mock_get,
    )

    response = client.get(
        "/api/v1/search/songs?q=ocean",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {
                "deezer_id": 456,
                "isrc": None,
                "title": "Good Song",
                "artist": "Good Artist",
                "artist_deezer_id": 789,
                "album": "Good Album",
                "cover_url": "https://example.com/fallback-cover.jpg",
                "preview_url": None,
            },
        ],
    }


def test_search_does_not_write_database_rows(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Search is transient; it does not persist song/provider data."""
    token = _get_token(client)
    _mock_successful_deezer_search(monkeypatch)
    user_count_before = db_session.scalar(select(func.count()).select_from(User))
    profile_count_before = db_session.scalar(select(func.count()).select_from(Profile))
    song_count_before = db_session.scalar(select(func.count()).select_from(Song))

    response = client.get(
        "/api/v1/search/songs?q=ocean",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(User)) == user_count_before
    assert db_session.scalar(select(func.count()).select_from(Profile)) == profile_count_before
    assert db_session.scalar(select(func.count()).select_from(Song)) == song_count_before
