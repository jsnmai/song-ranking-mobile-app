"""Integration tests for user_stats (rated_count + bookmarked_count) in ProfileSummaryResponse.

Privacy matrix tested:
- owner sees own user_stats
- public viewer sees user_stats on a public profile
- friends-only viewer without mutual follow sees user_stats=null
- only-me viewer sees user_stats=null
- blocked viewer sees user_stats=null
- rated_count reflects rankings rows (not rating_events)
- bookmarked_count reflects bookmarks rows
"""
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.limiter import limiter
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.bookmark import Bookmark
from src.sqlalchemy_tables.song import Song


def _register(client: TestClient, username: str) -> str:
    limiter._storage.reset()
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{username}@pm.example.com",
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": username.title(),
            "username": username,
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def _follow(client: TestClient, token: str, username: str) -> None:
    response = client.post(
        f"/api/v1/profile/{username}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _block(client: TestClient, token: str, username: str) -> None:
    response = client.post(
        f"/api/v1/profile/{username}/block",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _set_visibility(client: TestClient, token: str, visibility: str) -> None:
    response = client.put(
        "/api/v1/profile/me/visibility",
        json={"visibility": visibility},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _create_song(db: Session, deezer_id: int, title: str) -> Song:
    song = db.execute(select(Song).where(Song.deezer_id == deezer_id)).scalar_one_or_none()
    if song is None:
        song = Song(
            deezer_id=deezer_id,
            isrc=None,
            title=title,
            artist="Test Artist",
            artist_deezer_id=9999,
            album="Test Album",
            cover_url="https://example.com/cover.jpg",
            preview_url=None,
            genre_deezer=None,
        )
        db.add(song)
        db.flush()
    return song


def _create_ranking(db: Session, username: str, song: Song) -> Ranking:
    user_id = db.execute(select(Profile.user_id).where(Profile.username == username)).scalar_one()
    ranking = Ranking(user_id=user_id, song_id=song.id, bucket="like", position=1, score=9.0)
    db.add(ranking)
    db.commit()
    return ranking


def _create_bookmark(db: Session, username: str, song: Song) -> Bookmark:
    user_id = db.execute(select(Profile.user_id).where(Profile.username == username)).scalar_one()
    bm = Bookmark(user_id=user_id, song_id=song.id, source="manual")
    db.add(bm)
    db.commit()
    return bm


def _get_profile(client: TestClient, token: str, username: str | None = None) -> tuple[int, dict]:
    limiter._storage.reset()
    if username is None:
        path = "/api/v1/profile/me"
    else:
        path = f"/api/v1/profile/{username}"
    response = client.get(path, headers={"Authorization": f"Bearer {token}"})
    return response.status_code, response.json()


# ── Tests ────────────────────────────────────────────────────────────────────


def test_owner_sees_own_user_stats(client: TestClient, db_session: Session):
    """Owner always sees their own user_stats via /profile/me."""
    token = _register(client, "statsowner1")
    song_a = _create_song(db_session, 40001, "Rated Song A")
    song_b = _create_song(db_session, 40002, "Saved Song B")
    _create_ranking(db_session, "statsowner1", song_a)
    _create_bookmark(db_session, "statsowner1", song_b)

    status, data = _get_profile(client, token)

    assert status == 200
    assert data["user_stats"] is not None
    assert data["user_stats"]["rated_count"] == 1
    assert data["user_stats"]["bookmarked_count"] == 1


def test_public_viewer_sees_user_stats(client: TestClient, db_session: Session):
    """Public viewer sees user_stats on a public profile."""
    owner_token = _register(client, "statsowner2")
    viewer_token = _register(client, "statsviewer2")
    song = _create_song(db_session, 40003, "Public Rated")
    _create_ranking(db_session, "statsowner2", song)

    status, data = _get_profile(client, viewer_token, "statsowner2")

    assert status == 200
    assert data["user_stats"] is not None
    assert data["user_stats"]["rated_count"] == 1
    assert data["user_stats"]["bookmarked_count"] == 0
    _ = owner_token


def test_friends_only_non_mutual_sees_null_user_stats(client: TestClient, db_session: Session):
    """Non-mutual viewer cannot see user_stats on a friends-only profile."""
    owner_token = _register(client, "statsowner3")
    viewer_token = _register(client, "statsviewer3")
    _set_visibility(client, owner_token, "friends_only")
    song = _create_song(db_session, 40004, "Friends Only Rated")
    _create_ranking(db_session, "statsowner3", song)

    status, data = _get_profile(client, viewer_token, "statsowner3")

    assert status == 200
    assert data["user_stats"] is None


def test_only_me_viewer_sees_null_user_stats(client: TestClient, db_session: Session):
    """Only-me profile: viewer receives user_stats=null."""
    owner_token = _register(client, "statsowner4")
    viewer_token = _register(client, "statsviewer4")
    _set_visibility(client, owner_token, "only_me")
    song = _create_song(db_session, 40005, "Private Rated")
    _create_ranking(db_session, "statsowner4", song)

    status, data = _get_profile(client, viewer_token, "statsowner4")

    assert status == 200
    assert data["user_stats"] is None


def test_blocked_viewer_gets_404(client: TestClient, db_session: Session):
    """Blocked viewer cannot see the profile at all (404)."""
    owner_token = _register(client, "statsowner5")
    viewer_token = _register(client, "statsviewer5")
    _block(client, owner_token, "statsviewer5")
    song = _create_song(db_session, 40006, "Blocked Rated")
    _create_ranking(db_session, "statsowner5", song)

    status, _ = _get_profile(client, viewer_token, "statsowner5")

    assert status == 404
    _ = owner_token


def test_rated_count_reflects_rankings_not_events(client: TestClient, db_session: Session):
    """rated_count comes from the rankings table, not rating_events."""
    token = _register(client, "statsowner6")
    song_a = _create_song(db_session, 40007, "Ranked A")
    song_b = _create_song(db_session, 40008, "Ranked B")
    _create_ranking(db_session, "statsowner6", song_a)
    _create_ranking(db_session, "statsowner6", song_b)

    status, data = _get_profile(client, token)

    assert status == 200
    assert data["user_stats"]["rated_count"] == 2


def test_bookmarked_count_reflects_bookmarks(client: TestClient, db_session: Session):
    """bookmarked_count comes from the bookmarks table."""
    token = _register(client, "statsowner7")
    song_a = _create_song(db_session, 40009, "Saved A")
    song_b = _create_song(db_session, 40010, "Saved B")
    song_c = _create_song(db_session, 40011, "Saved C")
    _create_bookmark(db_session, "statsowner7", song_a)
    _create_bookmark(db_session, "statsowner7", song_b)
    _create_bookmark(db_session, "statsowner7", song_c)

    status, data = _get_profile(client, token)

    assert status == 200
    assert data["user_stats"]["bookmarked_count"] == 3


def test_mutual_follow_sees_friends_only_user_stats(client: TestClient, db_session: Session):
    """Mutual follow can see user_stats on a friends-only profile."""
    owner_token = _register(client, "statsowner8")
    viewer_token = _register(client, "statsviewer8")
    _set_visibility(client, owner_token, "friends_only")
    _follow(client, viewer_token, "statsowner8")
    _follow(client, owner_token, "statsviewer8")
    song = _create_song(db_session, 40012, "Friend Rated")
    _create_ranking(db_session, "statsowner8", song)

    status, data = _get_profile(client, viewer_token, "statsowner8")

    assert status == 200
    assert data["user_stats"] is not None
    assert data["user_stats"]["rated_count"] == 1
