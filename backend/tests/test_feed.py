# Integration tests for the fan-out-on-read social feed.
from urllib.parse import quote

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.profile import Profile


def _register(
    client: TestClient,
    email: str,
    username: str,
    display_name: str | None = None,
) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "display_name": display_name if display_name is not None else username.title(),
            "username": username,
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def _rating_payload(
    deezer_id: int,
    title: str,
    bucket: str = "like",
) -> dict:
    """Return a finalize-rating payload shaped like a user-touched Deezer song."""
    return {
        "song": {
            "deezer_id": deezer_id,
            "isrc": "USUG11900842",
            "title": title,
            "artist": "Frank Ocean",
            "artist_deezer_id": 456,
            "album": "Blonde",
            "cover_url": "https://example.com/cover.jpg",
            "preview_url": "https://example.com/preview.mp3",
            "genre_deezer": None,
        },
        "bucket": bucket,
    }


def _finalize_rating(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str,
    bucket: str = "like",
) -> dict:
    """Finalize a rating and return the response body."""
    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(
            deezer_id,
            title,
            bucket,
        ),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def _follow(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Follow a user by username."""
    response = client.post(
        f"/api/v1/profile/{username}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def test_feed_requires_auth(client: TestClient):
    """Feed is account-only."""
    response = client.get("/api/v1/feed")

    assert response.status_code == 401


def test_feed_returns_events_from_followed_users_only(client: TestClient):
    """The feed includes followed users' rating activity and excludes everyone else."""
    viewer_token = _register(
        client,
        "viewer@example.com",
        "viewer",
    )
    followed_token = _register(
        client,
        "followed@example.com",
        "followed",
        "Followed User",
    )
    stranger_token = _register(
        client,
        "stranger@example.com",
        "stranger",
        "Stranger User",
    )
    _follow(
        client,
        viewer_token,
        "followed",
    )
    _finalize_rating(
        client,
        followed_token,
        101,
        "Followed Song",
    )
    _finalize_rating(
        client,
        stranger_token,
        202,
        "Stranger Song",
    )

    response = client.get(
        "/api/v1/feed",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert [event["song"]["title"] for event in body["events"]] == ["Followed Song"]
    assert body["events"][0]["actor_profile"]["username"] == "followed"
    assert body["events"][0]["new_bucket"] == "like"
    assert body["events"][0]["new_score"] == 8.75
    assert body["next_cursor"] is None


def test_feed_uses_created_at_and_id_cursor(client: TestClient):
    """Feed pagination is stable using created_at plus id, not offset."""
    viewer_token = _register(
        client,
        "viewer@example.com",
        "viewer",
    )
    followed_token = _register(
        client,
        "followed@example.com",
        "followed",
    )
    _follow(
        client,
        viewer_token,
        "followed",
    )
    _finalize_rating(
        client,
        followed_token,
        101,
        "Older Song",
    )
    _finalize_rating(
        client,
        followed_token,
        202,
        "Newer Song",
        "alright",
    )

    first_response = client.get(
        "/api/v1/feed?limit=1",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert first_response.status_code == 200
    first_body = first_response.json()
    assert [event["song"]["title"] for event in first_body["events"]] == ["Newer Song"]
    assert first_body["next_cursor"] is not None

    second_response = client.get(
        f"/api/v1/feed?limit=1&cursor={quote(first_body['next_cursor'])}",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert second_response.status_code == 200
    second_body = second_response.json()
    assert [event["song"]["title"] for event in second_body["events"]] == ["Older Song"]
    assert second_body["next_cursor"] is None


def test_feed_rejects_invalid_cursor(client: TestClient):
    """Malformed cursors return a safe 400."""
    token = _register(
        client,
        "viewer@example.com",
        "viewer",
    )

    response = client.get(
        "/api/v1/feed?cursor=not-a-cursor",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid cursor."


def test_feed_hides_private_profiles(client: TestClient, db_session: Session):
    """Private profiles are excluded even when the viewer follows them."""
    viewer_token = _register(
        client,
        "viewer@example.com",
        "viewer",
    )
    private_token = _register(
        client,
        "private@example.com",
        "privateuser",
    )
    _follow(
        client,
        viewer_token,
        "privateuser",
    )
    _finalize_rating(
        client,
        private_token,
        101,
        "Private Song",
    )

    profile = db_session.execute(
        select(Profile)
        .where(Profile.username == "privateuser")
    ).scalar_one()
    profile.is_public = False
    db_session.commit()

    response = client.get(
        "/api/v1/feed",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200
    assert response.json()["events"] == []


def test_feed_hides_song_when_latest_event_is_removed(client: TestClient):
    """Feed hides the song entirely when the actor's latest action removed the rating."""
    viewer_token = _register(
        client,
        "viewer@example.com",
        "viewer",
    )
    followed_token = _register(
        client,
        "followed@example.com",
        "followed",
    )
    _follow(
        client,
        viewer_token,
        "followed",
    )
    rating = _finalize_rating(
        client,
        followed_token,
        101,
        "Removed Song",
    )
    remove_response = client.delete(
        f"/api/v1/ratings/{rating['ranking']['song_id']}",
        headers={"Authorization": f"Bearer {followed_token}"},
    )
    assert remove_response.status_code == 200

    response = client.get(
        "/api/v1/feed",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200
    assert response.json()["events"] == []


def test_feed_shows_only_latest_rerate_for_same_song(client: TestClient):
    """Rerating updates the feed item instead of showing old noise for the same actor/song."""
    viewer_token = _register(
        client,
        "viewer@example.com",
        "viewer",
    )
    followed_token = _register(
        client,
        "followed@example.com",
        "followed",
    )
    _follow(
        client,
        viewer_token,
        "followed",
    )
    _finalize_rating(
        client,
        followed_token,
        101,
        "Rerated Song",
    )
    _finalize_rating(
        client,
        followed_token,
        101,
        "Rerated Song",
        "dislike",
    )

    response = client.get(
        "/api/v1/feed",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200
    events = response.json()["events"]
    assert len(events) == 1
    assert events[0]["event_type"] == "rerated"
    assert events[0]["new_bucket"] == "dislike"


def test_feed_shows_only_new_rating_after_remove_then_rate_again(client: TestClient):
    """A new rating after removal appears once; the old removed rating stays hidden."""
    viewer_token = _register(
        client,
        "viewer@example.com",
        "viewer",
    )
    followed_token = _register(
        client,
        "followed@example.com",
        "followed",
    )
    _follow(
        client,
        viewer_token,
        "followed",
    )
    original = _finalize_rating(
        client,
        followed_token,
        101,
        "Rated Again Song",
    )
    remove_response = client.delete(
        f"/api/v1/ratings/{original['ranking']['song_id']}",
        headers={"Authorization": f"Bearer {followed_token}"},
    )
    assert remove_response.status_code == 200
    _finalize_rating(
        client,
        followed_token,
        101,
        "Rated Again Song",
        "alright",
    )

    response = client.get(
        "/api/v1/feed",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200
    events = response.json()["events"]
    assert len(events) == 1
    assert events[0]["event_type"] == "rated"
    assert events[0]["new_bucket"] == "alright"


def test_feed_cursor_from_one_user_does_not_leak_into_another_users_feed(client: TestClient):
    """A valid cursor from one viewer cannot be used to reveal that viewer's scoped feed to another user."""
    viewer_a_token = _register(
        client,
        "viewera@example.com",
        "viewera",
    )
    followed_a_token = _register(
        client,
        "followeda@example.com",
        "followeda",
    )
    viewer_b_token = _register(
        client,
        "viewerb@example.com",
        "viewerb",
    )
    _follow(
        client,
        viewer_a_token,
        "followeda",
    )
    _finalize_rating(
        client,
        followed_a_token,
        101,
        "A Older Song",
    )
    _finalize_rating(
        client,
        followed_a_token,
        202,
        "A Newer Song",
        "alright",
    )

    viewer_a_response = client.get(
        "/api/v1/feed?limit=1",
        headers={"Authorization": f"Bearer {viewer_a_token}"},
    )
    assert viewer_a_response.status_code == 200
    cursor = viewer_a_response.json()["next_cursor"]
    assert cursor is not None

    viewer_b_response = client.get(
        f"/api/v1/feed?cursor={quote(cursor)}",
        headers={"Authorization": f"Bearer {viewer_b_token}"},
    )

    assert viewer_b_response.status_code == 200
    assert viewer_b_response.json()["events"] == []


def test_feed_rate_limit_enforced(client: TestClient):
    """The feed endpoint returns 429 after 300 requests per minute."""
    token = _register(
        client,
        "viewer@example.com",
        "viewer",
    )
    responses = [
        client.get(
            "/api/v1/feed",
            headers={"Authorization": f"Bearer {token}"},
        )
        for _ in range(301)
    ]

    assert responses[-1].status_code == 429
