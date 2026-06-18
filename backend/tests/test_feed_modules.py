# Integration tests for the bundled Feed modules endpoint (Re-rate Radar live; rest reserved).
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.profile import Profile

RESERVED_MODULE_KEYS = ("consensus", "disagreement_spotlight", "split_decision", "match_moment")


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
            "birthdate": "2000-01-01",
            "display_name": display_name if display_name is not None else username.title(),
            "username": username,
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def _finalize_rating(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str,
    bucket: str = "like",
    note: str | None = None,
) -> dict:
    """Finalize a rating and return the response body."""
    payload = {
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
    if note is not None:
        payload["note"] = note
    response = client.post(
        "/api/v1/ratings/finalize",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def _rerate(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str,
    first_bucket: str,
    second_bucket: str,
    note: str | None = None,
) -> None:
    """Rate a song, then re-rate the same song — producing a `rerated` event."""
    _finalize_rating(client, token, deezer_id, title, first_bucket)
    _finalize_rating(client, token, deezer_id, title, second_bucket, note=note)


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


def _block(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Block a user by username."""
    response = client.post(
        f"/api/v1/profile/{username}/block",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _modules(
    client: TestClient,
    token: str,
) -> dict:
    """Fetch the bundled Feed modules for a viewer."""
    response = client.get(
        "/api/v1/feed/modules",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def test_feed_modules_requires_auth(client: TestClient):
    """The Feed modules endpoint is account-only."""
    response = client.get("/api/v1/feed/modules")

    assert response.status_code == 401


def test_feed_modules_empty_returns_null_modules(client: TestClient):
    """With no qualifying data every module is null — including the reserved keys."""
    token = _register(client, "viewer@example.com", "viewer")

    body = _modules(client, token)

    assert body["rerate_radar"] is None
    for key in RESERVED_MODULE_KEYS:
        assert body[key] is None


def test_rerate_radar_surfaces_followed_rerate_delta(client: TestClient):
    """A followed user's re-rate surfaces with its previous->new delta."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed", "Followed User")
    _follow(client, viewer, "followed")
    _rerate(client, followed, 101, "Moved Song", "like", "dislike")

    body = _modules(client, viewer)

    radar = body["rerate_radar"]
    assert radar is not None
    assert radar["actor_profile"]["username"] == "followed"
    assert radar["song"]["title"] == "Moved Song"
    assert radar["previous_bucket"] == "like"
    assert radar["new_bucket"] == "dislike"
    assert radar["previous_score"] == 8.75
    assert radar["new_score"] != radar["previous_score"]
    # The reserved modules stay null even once one module has data.
    for key in RESERVED_MODULE_KEYS:
        assert body[key] is None


def test_rerate_radar_ignores_plain_first_rating(client: TestClient):
    """A first-time rating (event_type `rated`) is not a re-rate and never appears."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    _finalize_rating(client, followed, 101, "First Rating Song", "like")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_ignores_unchanged_score(client: TestClient):
    """Re-rating to the same bucket/score is not a movement, so it is excluded."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    # The song is the only one in "like", so re-rating like->like keeps the same score.
    _rerate(client, followed, 101, "Unmoved Song", "like", "like")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_excludes_non_followed_user(client: TestClient):
    """A stranger's re-rate is not in the viewer's radar (friends only)."""
    viewer = _register(client, "viewer@example.com", "viewer")
    stranger = _register(client, "stranger@example.com", "stranger")
    _rerate(client, stranger, 101, "Stranger Song", "like", "dislike")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_excludes_own_rerate(client: TestClient):
    """Re-rate Radar is about *friends* — the viewer's own re-rates never appear."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _rerate(client, viewer, 101, "My Own Song", "like", "dislike")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_returns_only_latest(client: TestClient):
    """When a followed user re-rates several songs, only the newest re-rate shows."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    # Each song moves into an empty bucket so neither re-rate needs a contested-bucket position.
    _rerate(client, followed, 101, "Older Re-rate", "like", "dislike")
    _rerate(client, followed, 202, "Newer Re-rate", "like", "alright")

    radar = _modules(client, viewer)["rerate_radar"]
    assert radar is not None
    assert radar["song"]["title"] == "Newer Re-rate"


def test_rerate_radar_excludes_blocked_user(client: TestClient):
    """A followed user the viewer blocks drops out of the radar."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    _rerate(client, followed, 101, "Blocked Re-rate", "like", "dislike")
    assert _modules(client, viewer)["rerate_radar"] is not None

    _block(client, viewer, "followed")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_excludes_private_profile(client: TestClient, db_session: Session):
    """A followed user whose taste turns private drops out of the radar."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    _rerate(client, followed, 101, "Private Re-rate", "like", "dislike")
    assert _modules(client, viewer)["rerate_radar"] is not None

    profile = db_session.execute(
        select(Profile).where(Profile.username == "followed")
    ).scalar_one()
    profile.is_public = False
    profile.visibility = "only_me"
    db_session.commit()

    assert _modules(client, viewer)["rerate_radar"] is None
