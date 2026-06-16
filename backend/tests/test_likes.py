# Integration tests for likes on activity cards.
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.rating_event import RatingEvent


def _register(
    client: TestClient,
    email: str,
    username: str,
) -> tuple[str, int]:
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


def _rate(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str = "Song",
    bucket: str = "like",
) -> None:
    response = client.post(
        "/api/v1/ratings/finalize",
        json={
            "song": {
                "deezer_id": deezer_id,
                "isrc": None,
                "title": title,
                "artist": "Artist",
                "artist_deezer_id": 1,
                "album": "Album",
                "cover_url": "https://example.com/cover.jpg",
                "preview_url": None,
                "genre_deezer": None,
            },
            "bucket": bucket,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201


def _latest_event_id(db: Session, user_id: int) -> int:
    return db.execute(
        select(RatingEvent.id)
        .where(RatingEvent.user_id == user_id)
        .order_by(RatingEvent.id.desc())
    ).scalars().first()


def _like(client: TestClient, token: str, event_id: int):
    return client.post(
        f"/api/v1/activity/{event_id}/likes",
        headers={"Authorization": f"Bearer {token}"},
    )


def _unlike(client: TestClient, token: str, event_id: int):
    return client.delete(
        f"/api/v1/activity/{event_id}/likes",
        headers={"Authorization": f"Bearer {token}"},
    )


def _likers(client: TestClient, token: str, event_id: int):
    return client.get(
        f"/api/v1/activity/{event_id}/likes",
        headers={"Authorization": f"Bearer {token}"},
    )


def test_like_and_unlike_are_idempotent(client: TestClient, db_session: Session):
    """Liking is idempotent and reflects the count + viewer state; unlike reverses it."""
    author_token, author_id = _register(client, "author@example.com", "authoruser")
    viewer_token, _ = _register(client, "viewer@example.com", "vieweruser")
    _rate(client, author_token, 100)
    event_id = _latest_event_id(db_session, author_id)

    assert _like(client, viewer_token, event_id).json() == {
        "rating_event_id": event_id, "like_count": 1, "liked_by_viewer": True,
    }
    assert _like(client, viewer_token, event_id).json()["like_count"] == 1  # idempotent

    assert _unlike(client, viewer_token, event_id).json() == {
        "rating_event_id": event_id, "like_count": 0, "liked_by_viewer": False,
    }
    assert _unlike(client, viewer_token, event_id).json()["like_count"] == 0  # idempotent


def test_self_like_is_allowed(client: TestClient, db_session: Session):
    """A user can like their own activity."""
    author_token, author_id = _register(client, "author@example.com", "authoruser")
    _rate(client, author_token, 101)
    event_id = _latest_event_id(db_session, author_id)

    body = _like(client, author_token, event_id).json()
    assert body["like_count"] == 1
    assert body["liked_by_viewer"] is True


def test_likers_list_returns_who_liked(client: TestClient, db_session: Session):
    """The likers endpoint returns the users who liked the activity."""
    author_token, author_id = _register(client, "author@example.com", "authoruser")
    a_token, _ = _register(client, "a@example.com", "auser")
    b_token, _ = _register(client, "b@example.com", "buser")
    _rate(client, author_token, 102)
    event_id = _latest_event_id(db_session, author_id)
    _like(client, a_token, event_id)
    _like(client, b_token, event_id)

    response = _likers(client, author_token, event_id)
    assert response.status_code == 200
    assert {p["username"] for p in response.json()["profiles"]} == {"auser", "buser"}


def test_cannot_like_or_view_likers_of_only_me_activity(client: TestClient, db_session: Session):
    """only_me activity is not likeable/visible to others, but the owner can still like it."""
    author_token, author_id = _register(client, "author@example.com", "authoruser")
    viewer_token, _ = _register(client, "viewer@example.com", "vieweruser")
    _rate(client, author_token, 103)
    event_id = _latest_event_id(db_session, author_id)
    client.put(
        "/api/v1/profile/me/visibility",
        json={"visibility": "only_me"},
        headers={"Authorization": f"Bearer {author_token}"},
    )

    assert _like(client, viewer_token, event_id).status_code == 404
    assert _likers(client, viewer_token, event_id).status_code == 404
    assert _like(client, author_token, event_id).status_code == 200


def test_cannot_like_activity_of_blocking_user(client: TestClient, db_session: Session):
    """An author who blocked the viewer hides their activity from likes."""
    author_token, author_id = _register(client, "author@example.com", "authoruser")
    viewer_token, _ = _register(client, "viewer@example.com", "vieweruser")
    _rate(client, author_token, 104)
    event_id = _latest_event_id(db_session, author_id)
    client.post(
        "/api/v1/profile/vieweruser/block",
        headers={"Authorization": f"Bearer {author_token}"},
    )

    assert _like(client, viewer_token, event_id).status_code == 404


def test_cannot_like_nonexistent_activity(client: TestClient):
    """A like on a non-existent activity is a clean 404."""
    token, _ = _register(client, "viewer@example.com", "vieweruser")
    assert _like(client, token, 999999).status_code == 404


def test_like_requires_auth(client: TestClient):
    """Liking requires authentication."""
    assert client.post("/api/v1/activity/1/likes").status_code == 401
