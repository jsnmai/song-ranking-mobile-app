"""Integration tests for Friends' 9s and Co-Sign discovery."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.limiter import limiter
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song


def _register(
    client: TestClient,
    username: str,
) -> str:
    """Register one test user and return their token."""
    limiter._storage.reset()
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{username}@example.com",
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": username.title(),
            "username": username,
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def _follow(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Create one directed follow."""
    response = client.post(
        f"/api/v1/profile/{username}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _set_visibility(
    client: TestClient,
    token: str,
    visibility: str,
) -> None:
    """Update one user's taste visibility."""
    response = client.put(
        "/api/v1/profile/me/visibility",
        json={"visibility": visibility},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _create_ranking(
    db: Session,
    username: str,
    deezer_id: int,
    title: str,
    score: float,
    updated_at: datetime | None = None,
) -> None:
    """Create deterministic current Ranking state for social discovery tests."""
    user_id = db.execute(
        select(Profile.user_id)
        .where(Profile.username == username)
    ).scalar_one()
    song = db.execute(
        select(Song)
        .where(Song.deezer_id == deezer_id)
    ).scalar_one_or_none()
    if song is None:
        song = Song(
            deezer_id=deezer_id,
            isrc=None,
            title=title,
            artist="Discovery Artist",
            artist_deezer_id=456,
            album="Discovery Album",
            cover_url="https://example.com/cover.jpg",
            preview_url="https://example.com/preview.mp3",
            genre_deezer=None,
        )
        db.add(song)
        db.flush()
    ranking = Ranking(
        user_id=user_id,
        song_id=song.id,
        bucket="like",
        position=1,
        score=score,
    )
    if updated_at is not None:
        ranking.updated_at = updated_at
    db.add(ranking)
    db.commit()


def _get(
    client: TestClient,
    token: str,
    path: str,
) -> dict:
    """Get one authenticated discovery response."""
    response = client.get(
        path,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def test_social_discovery_requires_auth(client: TestClient):
    """Both social discovery surfaces require authentication."""
    assert client.get("/api/v1/discover/friends-9s").status_code == 401
    assert client.get("/api/v1/discover/co-signs").status_code == 401


def test_friends_nines_returns_only_unrated_scores_at_or_above_nine(
    client: TestClient,
    db_session: Session,
):
    """Friends' 9s excludes low scores, viewer ratings, and already-rated songs."""
    viewer_token = _register(client, "viewer")
    _register(client, "friend")
    _follow(client, viewer_token, "friend")
    _create_ranking(db_session, "friend", 101, "High Song", 9.0)
    _create_ranking(db_session, "friend", 102, "Low Song", 8.99)
    _create_ranking(db_session, "viewer", 103, "Already Rated Song", 9.9)
    _create_ranking(db_session, "friend", 103, "Already Rated Song", 9.9)

    body = _get(client, viewer_token, "/api/v1/discover/friends-9s")

    assert [item["song"]["title"] for item in body["items"]] == ["High Song"]
    assert body["items"][0]["visible_high_score_friend_count"] == 1
    assert body["items"][0]["contributors"][0]["username"] == "friend"


def test_friends_nines_counts_only_visible_non_blocked_non_deleted_contributors(
    client: TestClient,
    db_session: Session,
):
    """Privacy-inaccessible contributors neither count nor leak identities."""
    viewer_token = _register(client, "viewer")
    _register(client, "publicfriend")
    mutual_token = _register(client, "mutualfriend")
    one_way_token = _register(client, "oneway")
    only_me_token = _register(client, "onlyme")
    _register(client, "blocked")
    deleted_token = _register(client, "deleted")
    for username in ["publicfriend", "mutualfriend", "oneway", "onlyme", "blocked", "deleted"]:
        _follow(client, viewer_token, username)
    _follow(client, mutual_token, "viewer")
    _set_visibility(client, mutual_token, "friends_only")
    _set_visibility(client, one_way_token, "friends_only")
    _set_visibility(client, only_me_token, "only_me")
    block_response = client.post(
        "/api/v1/profile/blocked/block",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert block_response.status_code == 200
    for username in [
        "publicfriend",
        "mutualfriend",
        "oneway",
        "onlyme",
        "blocked",
        "deleted",
    ]:
        _create_ranking(db_session, username, 201, "Shared Song", 9.5)
    delete_response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {deleted_token}"},
    )
    assert delete_response.status_code == 204

    item = _get(client, viewer_token, "/api/v1/discover/friends-9s")["items"][0]

    assert item["visible_high_score_friend_count"] == 2
    assert {contributor["username"] for contributor in item["contributors"]} == {
        "publicfriend",
        "mutualfriend",
    }


def test_co_sign_requires_two_visible_friends_and_groups_by_song(
    client: TestClient,
    db_session: Session,
):
    """One visible high score is a Friend's 9, while two form one Co-Sign."""
    viewer_token = _register(client, "viewer")
    _register(client, "first")
    _register(client, "second")
    for username in ["first", "second"]:
        _follow(client, viewer_token, username)
    _create_ranking(db_session, "first", 301, "Co-Signed Song", 9.2)
    _create_ranking(db_session, "second", 301, "Co-Signed Song", 9.6)
    _create_ranking(db_session, "first", 302, "Single Song", 9.9)

    friends_items = _get(client, viewer_token, "/api/v1/discover/friends-9s")["items"]
    co_sign_items = _get(client, viewer_token, "/api/v1/discover/co-signs")["items"]

    assert {item["song"]["title"] for item in friends_items} == {"Co-Signed Song", "Single Song"}
    assert [item["song"]["title"] for item in co_sign_items] == ["Co-Signed Song"]
    assert co_sign_items[0]["co_sign_count"] == 2
    assert co_sign_items[0]["average_visible_friend_score"] == 9.4


def test_social_discovery_sorts_by_count_then_score_then_recency(
    client: TestClient,
    db_session: Session,
):
    """Recommendation strength sorting follows count, average score, then recency."""
    viewer_token = _register(client, "viewer")
    _register(client, "first")
    _register(client, "second")
    for username in ["first", "second"]:
        _follow(client, viewer_token, username)
    older = datetime.now(timezone.utc) - timedelta(days=2)
    newer = datetime.now(timezone.utc) - timedelta(days=1)
    for username, deezer_id, title, score, updated_at in [
        ("first", 401, "Two Friends", 9.0, older),
        ("second", 401, "Two Friends", 9.0, older),
        ("first", 402, "Higher Score", 9.8, older),
        ("first", 403, "Newer Same Score", 9.4, newer),
        ("first", 404, "Older Same Score", 9.4, older),
    ]:
        _create_ranking(db_session, username, deezer_id, title, score, updated_at)

    items = _get(client, viewer_token, "/api/v1/discover/friends-9s")["items"]

    assert [item["song"]["title"] for item in items] == [
        "Two Friends",
        "Higher Score",
        "Newer Same Score",
        "Older Same Score",
    ]


def test_social_discovery_returns_saved_state(
    client: TestClient,
    db_session: Session,
):
    """Discovery cards can render the viewer's private Saved state."""
    viewer_token = _register(client, "viewer")
    _register(client, "friend")
    _follow(client, viewer_token, "friend")
    _create_ranking(db_session, "friend", 501, "Saved Recommendation", 9.5)
    song_response = _get(client, viewer_token, "/api/v1/discover/friends-9s")["items"][0]["song"]
    save_response = client.post(
        "/api/v1/saved-songs",
        json={"song": song_response, "source": "discovery"},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert save_response.status_code == 200

    item = _get(client, viewer_token, "/api/v1/discover/friends-9s")["items"][0]

    assert item["is_saved"] is True
