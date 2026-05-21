# Integration tests for social profile search and follow relationships.
from fastapi.testclient import TestClient


def _register(
    client: TestClient,
    email: str,
    username: str,
    display_name: str,
) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "display_name": display_name,
            "username": username,
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def test_profile_search_requires_auth(client: TestClient):
    """Profile search is account-only."""
    response = client.get("/api/v1/profile/search?q=jas")

    assert response.status_code == 401


def test_search_profiles_by_username_and_display_name(client: TestClient):
    """Discover can search public profiles by username or display name."""
    viewer_token = _register(
        client,
        "viewer@example.com",
        "viewer",
        "Viewer",
    )
    _register(
        client,
        "target@example.com",
        "jasonmai",
        "Jason Mai",
    )

    response = client.get(
        "/api/v1/profile/search?q=Jason",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert [profile["username"] for profile in body["results"]] == ["jasonmai"]
    assert body["results"][0]["follower_count"] == 0
    assert body["results"][0]["following_count"] == 0
    assert body["results"][0]["is_following"] is False
    assert body["results"][0]["is_own_profile"] is False


def test_follow_profile_updates_both_counts_and_lists(client: TestClient):
    """Following someone increments their followers and the viewer's following list."""
    follower_token = _register(
        client,
        "follower@example.com",
        "follower",
        "Follower",
    )
    _register(
        client,
        "artist@example.com",
        "artistfan",
        "Artist Fan",
    )

    follow_response = client.post(
        "/api/v1/profile/artistfan/follow",
        headers={"Authorization": f"Bearer {follower_token}"},
    )
    assert follow_response.status_code == 200
    followed_profile = follow_response.json()
    assert followed_profile["username"] == "artistfan"
    assert followed_profile["follower_count"] == 1
    assert followed_profile["is_following"] is True

    me_response = client.get(
        "/api/v1/profile/me",
        headers={"Authorization": f"Bearer {follower_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["following_count"] == 1

    followers_response = client.get(
        "/api/v1/profile/artistfan/followers",
        headers={"Authorization": f"Bearer {follower_token}"},
    )
    assert followers_response.status_code == 200
    assert [profile["username"] for profile in followers_response.json()["profiles"]] == ["follower"]

    following_response = client.get(
        "/api/v1/profile/follower/following",
        headers={"Authorization": f"Bearer {follower_token}"},
    )
    assert following_response.status_code == 200
    assert [profile["username"] for profile in following_response.json()["profiles"]] == ["artistfan"]


def test_duplicate_follow_is_idempotent(client: TestClient):
    """Following the same profile twice does not create duplicate follower rows."""
    token = _register(
        client,
        "follower@example.com",
        "follower",
        "Follower",
    )
    _register(
        client,
        "target@example.com",
        "target",
        "Target",
    )

    first_response = client.post(
        "/api/v1/profile/target/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    second_response = client.post(
        "/api/v1/profile/target/follow",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.json()["follower_count"] == 1


def test_unfollow_profile_is_idempotent(client: TestClient):
    """Unfollowing removes the relationship and is safe to call again."""
    token = _register(
        client,
        "follower@example.com",
        "follower",
        "Follower",
    )
    _register(
        client,
        "target@example.com",
        "target",
        "Target",
    )

    client.post(
        "/api/v1/profile/target/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    first_response = client.delete(
        "/api/v1/profile/target/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    second_response = client.delete(
        "/api/v1/profile/target/follow",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert first_response.status_code == 200
    assert first_response.json()["follower_count"] == 0
    assert first_response.json()["is_following"] is False
    assert second_response.status_code == 200
    assert second_response.json()["follower_count"] == 0


def test_cannot_follow_self(client: TestClient):
    """Self-follow is blocked at the service layer before reaching the DB constraint."""
    token = _register(
        client,
        "self@example.com",
        "selfuser",
        "Self User",
    )

    response = client.post(
        "/api/v1/profile/selfuser/follow",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "You cannot follow yourself."
