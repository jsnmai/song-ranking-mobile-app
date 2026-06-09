"""Integration tests for GET /profile/{username}/bookmarks.

Privacy matrix:
- owner sees own bookmarks
- public viewer sees bookmarks on a public profile
- friends-only: non-mutual gets 404; mutual gets bookmarks
- only-me: other viewer gets 404
- response includes song info
"""
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.limiter import limiter
from src.sqlalchemy_tables.bookmark import Bookmark
from src.sqlalchemy_tables.profile import Profile
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


def _create_bookmark(db: Session, username: str, song: Song) -> Bookmark:
    user_id = db.execute(select(Profile.user_id).where(Profile.username == username)).scalar_one()
    bm = Bookmark(user_id=user_id, song_id=song.id, source="manual")
    db.add(bm)
    db.commit()
    return bm


def _get_bookmarks(client: TestClient, token: str, username: str) -> tuple[int, dict]:
    limiter._storage.reset()
    response = client.get(
        f"/api/v1/profile/{username}/bookmarks",
        headers={"Authorization": f"Bearer {token}"},
    )
    return response.status_code, response.json()


# ── Tests ────────────────────────────────────────────────────────────────────


def test_owner_sees_own_bookmarks(client: TestClient, db_session: Session):
    """Owner sees their own bookmarks via the username endpoint."""
    token = _register(client, "bkowner1")
    song = _create_song(db_session, 50001, "Bookmarked Song One")
    _create_bookmark(db_session, "bkowner1", song)

    status, data = _get_bookmarks(client, token, "bkowner1")

    assert status == 200
    assert len(data["bookmarks"]) == 1
    assert data["bookmarks"][0]["song"]["title"] == "Bookmarked Song One"


def test_public_viewer_sees_public_bookmarks(client: TestClient, db_session: Session):
    """Public viewer sees bookmarks on a public profile."""
    owner_token = _register(client, "bkowner2")
    viewer_token = _register(client, "bkviewer2")
    song = _create_song(db_session, 50002, "Public Bookmarked")
    _create_bookmark(db_session, "bkowner2", song)

    status, data = _get_bookmarks(client, viewer_token, "bkowner2")

    assert status == 200
    assert len(data["bookmarks"]) == 1
    _ = owner_token


def test_friends_only_non_mutual_gets_404(client: TestClient, db_session: Session):
    """Non-mutual viewer cannot see bookmarks on a friends-only profile."""
    owner_token = _register(client, "bkowner3")
    viewer_token = _register(client, "bkviewer3")
    _set_visibility(client, owner_token, "friends_only")
    song = _create_song(db_session, 50003, "Friends Bookmarked")
    _create_bookmark(db_session, "bkowner3", song)

    status, _ = _get_bookmarks(client, viewer_token, "bkowner3")

    assert status == 404


def test_mutual_follow_sees_friends_only_bookmarks(client: TestClient, db_session: Session):
    """Mutual follow sees bookmarks on a friends-only profile."""
    owner_token = _register(client, "bkowner4")
    viewer_token = _register(client, "bkviewer4")
    _set_visibility(client, owner_token, "friends_only")
    _follow(client, viewer_token, "bkowner4")
    _follow(client, owner_token, "bkviewer4")
    song = _create_song(db_session, 50004, "Mutual Bookmarked")
    _create_bookmark(db_session, "bkowner4", song)

    status, data = _get_bookmarks(client, viewer_token, "bkowner4")

    assert status == 200
    assert len(data["bookmarks"]) == 1


def test_only_me_viewer_gets_404(client: TestClient, db_session: Session):
    """Only-me profile: other user cannot see bookmarks."""
    owner_token = _register(client, "bkowner5")
    viewer_token = _register(client, "bkviewer5")
    _set_visibility(client, owner_token, "only_me")
    song = _create_song(db_session, 50005, "Private Bookmarked")
    _create_bookmark(db_session, "bkowner5", song)

    status, _ = _get_bookmarks(client, viewer_token, "bkowner5")

    assert status == 404


def test_empty_bookmarks_returns_empty_list(client: TestClient, db_session: Session):
    """User with no bookmarks returns an empty list."""
    token = _register(client, "bkowner6")
    viewer_token = _register(client, "bkviewer6")

    status, data = _get_bookmarks(client, viewer_token, "bkowner6")

    assert status == 200
    assert data["bookmarks"] == []
    _ = token


def test_bookmarked_song_has_title_and_artist(client: TestClient, db_session: Session):
    """Bookmark response includes song title and artist."""
    token = _register(client, "bkowner7")
    viewer_token = _register(client, "bkviewer7")
    song = _create_song(db_session, 50006, "Bookmarked Track")
    _create_bookmark(db_session, "bkowner7", song)

    status, data = _get_bookmarks(client, viewer_token, "bkowner7")

    assert status == 200
    bm = data["bookmarks"][0]
    assert bm["song"]["title"] == "Bookmarked Track"
    assert bm["song"]["artist"] == "Test Artist"
    _ = token
