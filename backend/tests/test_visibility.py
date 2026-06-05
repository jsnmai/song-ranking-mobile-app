# Integration tests for visibility, blocking, and privacy-aware taste surfaces.
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot


def _register(
    client: TestClient,
    email: str,
    username: str,
) -> tuple[str, int]:
    """Register a user and return (token, user_id)."""
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
    data = response.json()
    return data["access_token"], data["user"]["id"]


def _set_visibility(
    client: TestClient,
    token: str,
    visibility: str,
) -> dict:
    """Update the current user's visibility and return the response body."""
    response = client.put(
        "/api/v1/profile/me/visibility",
        json={"visibility": visibility},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def _follow(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Follow a profile by username."""
    response = client.post(
        f"/api/v1/profile/{username}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _finalize_rating(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str,
) -> None:
    """Finalize a simple rating for feed visibility tests."""
    response = client.post(
        "/api/v1/ratings/finalize",
        json={
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
            "bucket": "like",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201


def _seed_snapshot(
    db: Session,
    uid_a: int,
    uid_b: int,
) -> None:
    """Insert a compatibility snapshot directly for read-gating tests."""
    a, b = min(uid_a, uid_b), max(uid_a, uid_b)
    db.add(
        UserSimilaritySnapshot(
            user_a_id=a,
            user_b_id=b,
            similarity_score=0.82,
            shared_song_count=5,
            score_distance_avg=1.1,
            shared_genres=["R&B"],
            shared_top_artists=["SZA"],
            algorithm_version="v1_cosine",
        )
    )
    db.commit()


def test_public_taste_is_visible_to_non_blocked_viewer(client: TestClient) -> None:
    """Public taste data is visible to another authenticated user."""
    viewer_token, _ = _register(client, "viewer@example.com", "viewer")
    _register(client, "target@example.com", "target")

    response = client.get(
        "/api/v1/profile/target/taste",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200


def test_friends_only_taste_visible_to_mutual_friends(client: TestClient) -> None:
    """Friends-only taste is visible only when both users follow each other."""
    viewer_token, _ = _register(client, "viewer@example.com", "viewer")
    target_token, _ = _register(client, "target@example.com", "target")
    _set_visibility(client, target_token, "friends_only")
    _follow(client, viewer_token, "target")
    _follow(client, target_token, "viewer")

    response = client.get(
        "/api/v1/profile/target/taste",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200


def test_friends_only_taste_hidden_from_non_friends_but_shell_visible(client: TestClient) -> None:
    """Friends-only hides taste from non-friends while preserving the minimal profile shell."""
    viewer_token, _ = _register(client, "viewer@example.com", "viewer")
    target_token, _ = _register(client, "target@example.com", "target")
    _set_visibility(client, target_token, "friends_only")

    shell_response = client.get(
        "/api/v1/profile/target",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    taste_response = client.get(
        "/api/v1/profile/target/taste",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert shell_response.status_code == 200
    assert shell_response.json()["can_view_taste"] is False
    assert taste_response.status_code == 404


def test_only_me_taste_visible_only_to_owner(client: TestClient) -> None:
    """Only-me taste is hidden from everyone except the owner."""
    viewer_token, _ = _register(client, "viewer@example.com", "viewer")
    target_token, _ = _register(client, "target@example.com", "target")
    _set_visibility(client, target_token, "only_me")

    owner_response = client.get(
        "/api/v1/profile/me/taste",
        headers={"Authorization": f"Bearer {target_token}"},
    )
    viewer_response = client.get(
        "/api/v1/profile/target/taste",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert owner_response.status_code == 200
    assert viewer_response.status_code == 404


def test_blocked_user_cannot_view_profile_or_taste(client: TestClient) -> None:
    """Blocks override public profile and taste visibility."""
    blocker_token, _ = _register(client, "blocker@example.com", "blocker")
    blocked_token, _ = _register(client, "blocked@example.com", "blocked")

    response = client.post(
        "/api/v1/profile/blocked/block",
        headers={"Authorization": f"Bearer {blocker_token}"},
    )
    assert response.status_code == 200
    assert response.json()["is_blocked"] is True

    profile_response = client.get(
        "/api/v1/profile/blocker",
        headers={"Authorization": f"Bearer {blocked_token}"},
    )
    taste_response = client.get(
        "/api/v1/profile/blocker/taste",
        headers={"Authorization": f"Bearer {blocked_token}"},
    )

    assert profile_response.status_code == 404
    assert taste_response.status_code == 404


def test_feed_excludes_events_after_visibility_change(client: TestClient) -> None:
    """Feed renders against current visibility, so old events disappear retroactively."""
    viewer_token, _ = _register(client, "viewer@example.com", "viewer")
    target_token, _ = _register(client, "target@example.com", "target")
    _follow(client, viewer_token, "target")
    _finalize_rating(client, target_token, 1001, "Visible Song")

    visible_response = client.get(
        "/api/v1/feed",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert [event["song"]["title"] for event in visible_response.json()["events"]] == ["Visible Song"]

    _set_visibility(client, target_token, "only_me")
    hidden_response = client.get(
        "/api/v1/feed",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert hidden_response.status_code == 200
    assert hidden_response.json()["events"] == []


def test_feed_excludes_blocked_relationships_retroactively(client: TestClient) -> None:
    """Blocks remove already-created feed events from both users' social surfaces."""
    viewer_token, _ = _register(client, "viewer@example.com", "viewer")
    target_token, _ = _register(client, "target@example.com", "target")
    _follow(client, viewer_token, "target")
    _finalize_rating(client, target_token, 1002, "Blocked Song")

    client.post(
        "/api/v1/profile/target/block",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    response = client.get(
        "/api/v1/feed",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200
    assert response.json()["events"] == []


def test_compatibility_requires_visible_non_blocked_taste(
    client: TestClient,
    db_session: Session,
) -> None:
    """Compatibility does not expose snapshots for hidden or blocked users."""
    viewer_token, viewer_id = _register(client, "viewer@example.com", "viewer")
    target_token, target_id = _register(client, "target@example.com", "target")
    _seed_snapshot(db_session, viewer_id, target_id)

    public_response = client.get(
        "/api/v1/profile/target/compatibility",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert public_response.status_code == 200
    assert public_response.json()["has_overlap"] is True

    _set_visibility(client, target_token, "only_me")
    hidden_response = client.get(
        "/api/v1/profile/target/compatibility",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert hidden_response.status_code == 404

    _set_visibility(client, target_token, "public")
    client.post(
        "/api/v1/profile/target/block",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    blocked_response = client.get(
        "/api/v1/profile/target/compatibility",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert blocked_response.status_code == 404


def test_unblock_restores_access_according_to_visibility(client: TestClient) -> None:
    """Unblocking restores profile shell access when current visibility allows it."""
    viewer_token, _ = _register(client, "viewer@example.com", "viewer")
    _register(client, "target@example.com", "target")
    client.post(
        "/api/v1/profile/target/block",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    unblock_response = client.delete(
        "/api/v1/profile/target/block",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    profile_response = client.get(
        "/api/v1/profile/target",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert unblock_response.status_code == 200
    assert unblock_response.json()["is_blocked"] is False
    assert profile_response.status_code == 200
