# Integration tests for in-app notifications (follows + likes).
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.services.notification import NOTIFICATION_RESURFACE_COOLDOWN
from src.sqlalchemy_tables.notification import Notification
from src.sqlalchemy_tables.rating_event import RatingEvent


def _register(client: TestClient, email: str, username: str) -> tuple[str, int]:
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


def _rate(client: TestClient, token: str, deezer_id: int) -> None:
    response = client.post(
        "/api/v1/ratings/finalize",
        json={
            "song": {
                "deezer_id": deezer_id,
                "isrc": None,
                "title": "Song",
                "artist": "Artist",
                "artist_deezer_id": 1,
                "album": "Album",
                "cover_url": "https://example.com/cover.jpg",
                "preview_url": None,
                "genre_deezer": None,
            },
            "bucket": "like",
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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _follow(client: TestClient, token: str, username: str):
    return client.post(f"/api/v1/profile/{username}/follow", headers=_auth(token))


def _unfollow(client: TestClient, token: str, username: str):
    return client.delete(f"/api/v1/profile/{username}/follow", headers=_auth(token))


def _like(client: TestClient, token: str, event_id: int):
    return client.post(f"/api/v1/activity/{event_id}/likes", headers=_auth(token))


def _unlike(client: TestClient, token: str, event_id: int):
    return client.delete(f"/api/v1/activity/{event_id}/likes", headers=_auth(token))


def _notifications(client: TestClient, token: str):
    return client.get("/api/v1/notifications", headers=_auth(token))


def _unread(client: TestClient, token: str) -> int:
    return client.get("/api/v1/notifications/unread-count", headers=_auth(token)).json()["unread_count"]


def test_follow_creates_notification_for_recipient_only(client: TestClient):
    """Following someone notifies them; the follower has nothing."""
    recipient_token, _ = _register(client, "recipient@example.com", "recipientuser")
    actor_token, _ = _register(client, "actor@example.com", "actoruser")

    assert _follow(client, actor_token, "recipientuser").status_code == 200

    items = _notifications(client, recipient_token).json()["items"]
    assert len(items) == 1
    assert items[0]["type"] == "follow"
    assert items[0]["actor"]["username"] == "actoruser"
    assert items[0]["song"] is None
    assert items[0]["read"] is False
    assert _unread(client, recipient_token) == 1

    # The actor (follower) gets no notification.
    assert _notifications(client, actor_token).json()["items"] == []


def test_like_notifies_author_with_song_and_skips_self_like(client: TestClient, db_session: Session):
    """Liking an activity notifies its author with the song; self-likes never notify."""
    author_token, author_id = _register(client, "author@example.com", "authoruser")
    liker_token, _ = _register(client, "liker@example.com", "likeruser")
    _rate(client, author_token, 200)
    event_id = _latest_event_id(db_session, author_id)

    # Author liking their own activity: allowed, but no self-notification.
    assert _like(client, author_token, event_id).status_code == 200
    assert _notifications(client, author_token).json()["items"] == []

    # Another user liking it notifies the author, with the song attached.
    assert _like(client, liker_token, event_id).status_code == 200
    items = _notifications(client, author_token).json()["items"]
    assert len(items) == 1
    assert items[0]["type"] == "like"
    assert items[0]["actor"]["username"] == "likeruser"
    assert items[0]["rating_event_id"] == event_id
    assert items[0]["song"] is not None


def test_mark_read_clears_unread_count(client: TestClient):
    """Opening notifications marks them read; unread count drops to zero."""
    recipient_token, _ = _register(client, "recipient@example.com", "recipientuser")
    actor_token, _ = _register(client, "actor@example.com", "actoruser")
    _follow(client, actor_token, "recipientuser")

    assert _unread(client, recipient_token) == 1
    assert client.post("/api/v1/notifications/read", headers=_auth(recipient_token)).json() == {"unread_count": 0}
    assert _unread(client, recipient_token) == 0
    # The row stays (history) but is now read.
    assert _notifications(client, recipient_token).json()["items"][0]["read"] is True


def test_refollow_within_cooldown_is_silent_no_op(client: TestClient):
    """Unfollow + refollow in quick succession does not spam a second notification."""
    recipient_token, _ = _register(client, "recipient@example.com", "recipientuser")
    actor_token, _ = _register(client, "actor@example.com", "actoruser")

    _follow(client, actor_token, "recipientuser")
    client.post("/api/v1/notifications/read", headers=_auth(recipient_token))  # read it
    _unfollow(client, actor_token, "recipientuser")
    _follow(client, actor_token, "recipientuser")  # rapid refollow

    items = _notifications(client, recipient_token).json()["items"]
    assert len(items) == 1  # still one row — no spam
    assert _unread(client, recipient_token) == 0  # not resurfaced as unread


def test_refollow_after_cooldown_resurfaces_as_unread(client: TestClient, db_session: Session):
    """A genuine refollow past the cooldown bumps the row back to unread."""
    recipient_token, recipient_id = _register(client, "recipient@example.com", "recipientuser")
    actor_token, _ = _register(client, "actor@example.com", "actoruser")

    _follow(client, actor_token, "recipientuser")
    client.post("/api/v1/notifications/read", headers=_auth(recipient_token))
    assert _unread(client, recipient_token) == 0

    # Age the existing notification past the cooldown.
    row = db_session.execute(
        select(Notification).where(Notification.recipient_id == recipient_id)
    ).scalar_one()
    row.created_at = datetime.now(timezone.utc) - NOTIFICATION_RESURFACE_COOLDOWN - timedelta(minutes=1)
    db_session.commit()

    _unfollow(client, actor_token, "recipientuser")
    _follow(client, actor_token, "recipientuser")

    items = _notifications(client, recipient_token).json()["items"]
    assert len(items) == 1  # still one row
    assert items[0]["read"] is False  # resurfaced as unread
    assert _unread(client, recipient_token) == 1


def test_activity_card_endpoint_returns_the_card(client: TestClient, db_session: Session):
    """The single-activity endpoint returns the verdict that was liked."""
    author_token, author_id = _register(client, "author@example.com", "authoruser")
    _rate(client, author_token, 201)
    event_id = _latest_event_id(db_session, author_id)

    body = client.get(f"/api/v1/activity/{event_id}", headers=_auth(author_token)).json()
    assert body["rating_event_id"] == event_id
    assert body["bucket"] == "like"
    assert body["song"]["title"] == "Song"
