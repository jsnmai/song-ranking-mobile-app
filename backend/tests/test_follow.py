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
            "birthdate": "2000-01-01",
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


def test_is_followed_by_reports_reverse_follow_direction(client: TestClient):
    """Profile summaries expose the reverse follow direction so mutual-follow UI can render."""
    a_token = _register(
        client,
        "a@example.com",
        "usera",
        "User A",
    )
    b_token = _register(
        client,
        "b@example.com",
        "userb",
        "User B",
    )

    # A follows B: A's view of B is one-way outgoing.
    follow_response = client.post(
        "/api/v1/profile/userb/follow",
        headers={"Authorization": f"Bearer {a_token}"},
    )
    assert follow_response.status_code == 200

    a_view_of_b = client.get(
        "/api/v1/profile/userb",
        headers={"Authorization": f"Bearer {a_token}"},
    ).json()
    assert a_view_of_b["is_following"] is True
    assert a_view_of_b["is_followed_by"] is False

    b_view_of_a = client.get(
        "/api/v1/profile/usera",
        headers={"Authorization": f"Bearer {b_token}"},
    ).json()
    assert b_view_of_a["is_following"] is False
    assert b_view_of_a["is_followed_by"] is True

    # B follows A back: both directions are now true for both viewers.
    follow_back_response = client.post(
        "/api/v1/profile/usera/follow",
        headers={"Authorization": f"Bearer {b_token}"},
    )
    assert follow_back_response.status_code == 200

    mutual_view = client.get(
        "/api/v1/profile/userb",
        headers={"Authorization": f"Bearer {a_token}"},
    ).json()
    assert mutual_view["is_following"] is True
    assert mutual_view["is_followed_by"] is True


def test_profile_search_includes_similarity_when_snapshot_exists(
    client: TestClient,
    db_session,
):
    """User search rows carry similarity_score so the UI can show a taste match."""
    from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot

    viewer_token = _register(
        client,
        "viewer2@example.com",
        "viewer2",
        "Viewer Two",
    )
    _register(
        client,
        "match@example.com",
        "matchuser",
        "Match User",
    )

    viewer_id = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {viewer_token}"},
    ).json()["id"]
    target = client.get(
        "/api/v1/profile/matchuser",
        headers={"Authorization": f"Bearer {viewer_token}"},
    ).json()

    # No snapshot yet: similarity is null rather than fabricated.
    no_snapshot_results = client.get(
        "/api/v1/profile/search?q=matchuser",
        headers={"Authorization": f"Bearer {viewer_token}"},
    ).json()["results"]
    assert no_snapshot_results[0]["similarity_score"] is None

    a, b = sorted([viewer_id, target["user_id"]])
    db_session.add(
        UserSimilaritySnapshot(
            user_a_id=a,
            user_b_id=b,
            similarity_score=0.87,
            shared_song_count=9,
            score_distance_avg=1.0,
            shared_genres=["R&B"],
            shared_top_artists=["Frank Ocean"],
            algorithm_version="v1_cosine",
        )
    )
    db_session.commit()

    results = client.get(
        "/api/v1/profile/search?q=matchuser",
        headers={"Authorization": f"Bearer {viewer_token}"},
    ).json()["results"]
    assert results[0]["username"] == "matchuser"
    assert results[0]["similarity_score"] == 0.87


def test_only_me_profile_hides_follow_lists_but_keeps_counts(client: TestClient):
    """only_me profiles keep follower/following COUNTS but hide the lists from non-owners."""
    owner_token = _register(client, "owner@example.com", "owneruser", "Owner")
    follower_token = _register(client, "follower@example.com", "followeruser", "Follower")
    _register(client, "third@example.com", "thirduser", "Third")

    # The owner gains one follower and follows one user.
    assert client.post(
        "/api/v1/profile/owneruser/follow",
        headers={"Authorization": f"Bearer {follower_token}"},
    ).status_code == 200
    assert client.post(
        "/api/v1/profile/thirduser/follow",
        headers={"Authorization": f"Bearer {owner_token}"},
    ).status_code == 200
    # The owner sets their taste to only_me.
    assert client.put(
        "/api/v1/profile/me/visibility",
        json={"visibility": "only_me"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).status_code == 200

    # A non-owner sees EMPTY follow lists for the only_me profile.
    followers = client.get(
        "/api/v1/profile/owneruser/followers",
        headers={"Authorization": f"Bearer {follower_token}"},
    )
    following = client.get(
        "/api/v1/profile/owneruser/following",
        headers={"Authorization": f"Bearer {follower_token}"},
    )
    assert followers.status_code == 200
    assert followers.json()["profiles"] == []
    assert following.json()["profiles"] == []

    # ...but the COUNTS are still visible on the profile summary.
    summary = client.get(
        "/api/v1/profile/owneruser",
        headers={"Authorization": f"Bearer {follower_token}"},
    ).json()
    assert summary["follower_count"] == 1
    assert summary["following_count"] == 1

    # The owner still sees their own lists in full.
    own_followers = client.get(
        "/api/v1/profile/owneruser/followers",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    own_following = client.get(
        "/api/v1/profile/owneruser/following",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert [p["username"] for p in own_followers.json()["profiles"]] == ["followeruser"]
    assert [p["username"] for p in own_following.json()["profiles"]] == ["thirduser"]
