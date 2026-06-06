"""Integration tests for private current-user Saved Songs."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.saved_song import SavedSong
from src.sqlalchemy_tables.song import Song


def _register(
    client: TestClient,
    email: str = "user@example.com",
    username: str = "testuser",
) -> tuple[str, int]:
    """Register a user and return their token and ID."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": username.title(),
            "username": username,
        },
    )
    assert response.status_code == 201
    body = response.json()
    return body["access_token"], body["user"]["id"]


def _song_payload(
    deezer_id: int = 123,
    title: str = "Nights",
) -> dict:
    """Return normalized provider metadata for a Saved Songs save."""
    return {
        "deezer_id": deezer_id,
        "isrc": "USUG11900842",
        "title": title,
        "artist": "Frank Ocean",
        "artist_deezer_id": 456,
        "album": "Blonde",
        "cover_url": "https://example.com/cover.jpg",
        "preview_url": "https://example.com/preview.mp3",
        "genre_deezer": None,
    }


def _save(
    client: TestClient,
    token: str,
    deezer_id: int = 123,
    title: str = "Nights",
    source: str | None = "song_detail",
) -> dict:
    """Save one song and return the response body."""
    response = client.post(
        "/api/v1/saved-songs",
        json={
            "song": _song_payload(deezer_id, title),
            "source": source,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def _rate(
    client: TestClient,
    token: str,
    deezer_id: int = 123,
    title: str = "Nights",
) -> dict:
    """Rate one song directly into an empty Like bucket."""
    response = client.post(
        "/api/v1/ratings/finalize",
        json={
            "song": _song_payload(deezer_id, title),
            "bucket": "like",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def test_save_song_requires_auth(client: TestClient) -> None:
    """Anonymous callers cannot save songs."""
    response = client.post(
        "/api/v1/saved-songs",
        json={"song": _song_payload(), "source": "song_detail"},
    )

    assert response.status_code == 401


def test_user_can_save_song_idempotently_with_source(
    client: TestClient,
    db_session: Session,
) -> None:
    """Saving persists the song and one owner-scoped saved row."""
    token, user_id = _register(client)

    first = _save(client, token)
    second = _save(client, token, source="search")

    assert second["id"] == first["id"]
    assert first["source"] == "song_detail"
    assert first["song"]["title"] == "Nights"
    assert first["ranking"] is None
    assert db_session.scalar(
        select(func.count())
        .select_from(SavedSong)
        .where(SavedSong.user_id == user_id)
    ) == 1


def test_user_can_unsave_without_deleting_song_metadata(
    client: TestClient,
    db_session: Session,
) -> None:
    """Unsave is idempotent and preserves the durable song row."""
    token, _ = _register(client)
    saved = _save(client, token)

    first = client.delete(
        f"/api/v1/saved-songs/{saved['song']['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    second = client.delete(
        f"/api/v1/saved-songs/{saved['song']['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert first.status_code == 200
    assert first.json()["removed"] is True
    assert second.status_code == 200
    assert second.json()["removed"] is False
    assert db_session.get(Song, saved["song"]["id"]) is not None


def test_list_and_status_are_current_user_only(
    client: TestClient,
) -> None:
    """Users can list and inspect only their own private saves."""
    owner_token, _ = _register(client, "owner@example.com", "owner")
    other_token, _ = _register(client, "other@example.com", "other")
    saved = _save(client, owner_token)

    owner_list = client.get(
        "/api/v1/saved-songs",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    other_list = client.get(
        "/api/v1/saved-songs",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    owner_status = client.get(
        "/api/v1/saved-songs/by-deezer/123",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    other_status = client.get(
        "/api/v1/saved-songs/by-deezer/123",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert owner_list.json()["saves"][0]["id"] == saved["id"]
    assert other_list.json() == {"saves": []}
    assert owner_status.json()["is_saved"] is True
    assert other_status.json() == {"is_saved": False, "save": None}


def test_saved_songs_list_is_newest_first(
    client: TestClient,
    db_session: Session,
) -> None:
    """Saved Songs returns newest saves first."""
    token, user_id = _register(client)
    older = _save(client, token, deezer_id=123, title="Older")
    newer = _save(client, token, deezer_id=456, title="Newer")
    db_session.execute(
        select(SavedSong)
        .where(SavedSong.user_id == user_id)
        .where(SavedSong.id == older["id"])
    ).scalar_one().created_at = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()

    response = client.get(
        "/api/v1/saved-songs",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert [save["id"] for save in response.json()["saves"]] == [newer["id"], older["id"]]


def test_saving_rated_song_returns_current_ranking(
    client: TestClient,
) -> None:
    """Rated songs can still be saved."""
    token, _ = _register(client)
    rated = _rate(client, token)

    saved = _save(client, token)

    assert saved["ranking"]["id"] == rated["ranking"]["id"]
    assert saved["ranking"]["bucket"] == "like"


def test_rating_saved_song_keeps_it_saved(
    client: TestClient,
) -> None:
    """Rating does not automatically remove a saved song."""
    token, _ = _register(client)
    saved = _save(client, token)

    rated = _rate(client, token)
    status = client.get(
        "/api/v1/saved-songs/by-deezer/123",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert status.status_code == 200
    assert status.json()["is_saved"] is True
    assert status.json()["save"]["id"] == saved["id"]
    assert status.json()["save"]["ranking"]["id"] == rated["ranking"]["id"]
