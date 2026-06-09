"""Integration tests for private current-user Bookmarks."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.bookmark import Bookmark
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
    """Return normalized provider metadata for a bookmark."""
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


def _bookmark(
    client: TestClient,
    token: str,
    deezer_id: int = 123,
    title: str = "Nights",
    source: str | None = "song_detail",
) -> dict:
    """Bookmark one song and return the response body."""
    response = client.post(
        "/api/v1/bookmarks",
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


def test_bookmark_requires_auth(client: TestClient) -> None:
    """Anonymous callers cannot bookmark songs."""
    response = client.post(
        "/api/v1/bookmarks",
        json={"song": _song_payload(), "source": "song_detail"},
    )

    assert response.status_code == 401


def test_user_can_bookmark_song_idempotently_with_source(
    client: TestClient,
    db_session: Session,
) -> None:
    """Bookmarking persists the song and one owner-scoped bookmark row."""
    token, user_id = _register(client)

    first = _bookmark(client, token)
    second = _bookmark(client, token, source="search")

    assert second["id"] == first["id"]
    assert first["source"] == "song_detail"
    assert first["song"]["title"] == "Nights"
    assert first["ranking"] is None
    assert db_session.scalar(
        select(func.count())
        .select_from(Bookmark)
        .where(Bookmark.user_id == user_id)
    ) == 1


def test_user_can_remove_bookmark_without_deleting_song_metadata(
    client: TestClient,
    db_session: Session,
) -> None:
    """Removing a bookmark is idempotent and preserves the durable song row."""
    token, _ = _register(client)
    bm = _bookmark(client, token)

    first = client.delete(
        f"/api/v1/bookmarks/{bm['song']['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    second = client.delete(
        f"/api/v1/bookmarks/{bm['song']['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert first.status_code == 200
    assert first.json()["removed"] is True
    assert second.status_code == 200
    assert second.json()["removed"] is False
    assert db_session.get(Song, bm["song"]["id"]) is not None


def test_list_and_status_are_current_user_only(
    client: TestClient,
) -> None:
    """Users can list and inspect only their own private bookmarks."""
    owner_token, _ = _register(client, "owner@example.com", "owner")
    other_token, _ = _register(client, "other@example.com", "other")
    bm = _bookmark(client, owner_token)

    owner_list = client.get(
        "/api/v1/bookmarks",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    other_list = client.get(
        "/api/v1/bookmarks",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    owner_status = client.get(
        "/api/v1/bookmarks/by-deezer/123",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    other_status = client.get(
        "/api/v1/bookmarks/by-deezer/123",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert owner_list.json()["bookmarks"][0]["id"] == bm["id"]
    assert other_list.json() == {"bookmarks": []}
    assert owner_status.json()["is_bookmarked"] is True
    assert other_status.json() == {"is_bookmarked": False, "bookmark": None}


def test_bookmarks_list_is_newest_first(
    client: TestClient,
    db_session: Session,
) -> None:
    """Bookmarks returns newest entries first."""
    token, user_id = _register(client)
    older = _bookmark(client, token, deezer_id=123, title="Older")
    newer = _bookmark(client, token, deezer_id=456, title="Newer")
    db_session.execute(
        select(Bookmark)
        .where(Bookmark.user_id == user_id)
        .where(Bookmark.id == older["id"])
    ).scalar_one().created_at = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()

    response = client.get(
        "/api/v1/bookmarks",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert [bm["id"] for bm in response.json()["bookmarks"]] == [newer["id"], older["id"]]


def test_bookmarking_rated_song_returns_current_ranking(
    client: TestClient,
) -> None:
    """Rated songs can still be bookmarked."""
    token, _ = _register(client)
    rated = _rate(client, token)

    bm = _bookmark(client, token)

    assert bm["ranking"]["id"] == rated["ranking"]["id"]
    assert bm["ranking"]["bucket"] == "like"


def test_rating_bookmarked_song_keeps_it_bookmarked(
    client: TestClient,
) -> None:
    """Rating does not automatically remove a bookmark."""
    token, _ = _register(client)
    bm = _bookmark(client, token)

    rated = _rate(client, token)
    status = client.get(
        "/api/v1/bookmarks/by-deezer/123",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert status.status_code == 200
    assert status.json()["is_bookmarked"] is True
    assert status.json()["bookmark"]["id"] == bm["id"]
    assert status.json()["bookmark"]["ranking"]["id"] == rated["ranking"]["id"]
