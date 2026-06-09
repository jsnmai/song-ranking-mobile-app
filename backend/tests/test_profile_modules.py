"""Integration tests for profile Recent Verdicts and Rankings Preview endpoints.

Privacy matrix tested:
- owner can always see own data
- public viewer can see public profile data
- friends-only: mutual follow required
- only-me: no other viewer
- blocked: no other viewer
- newest-first ordering and note presence
- rankings privacy mirrors verdicts privacy
"""
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.limiter import limiter
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
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
            preview_url="https://example.com/preview.mp3",
            genre_deezer=None,
        )
        db.add(song)
        db.flush()
    return song


def _create_verdict(
    db: Session,
    username: str,
    song: Song,
    bucket: str = "like",
    score: float = 9.5,
    note: str | None = None,
    created_at: datetime | None = None,
) -> RatingEvent:
    user_id = db.execute(
        select(Profile.user_id).where(Profile.username == username)
    ).scalar_one()
    event = RatingEvent(
        user_id=user_id,
        song_id=song.id,
        event_type="rated",
        new_bucket=bucket,
        new_score=score,
        note=note,
    )
    if created_at is not None:
        event.created_at = created_at
    db.add(event)
    db.commit()
    return event


def _create_ranking(
    db: Session,
    username: str,
    song: Song,
    bucket: str = "like",
    score: float = 9.5,
) -> Ranking:
    user_id = db.execute(
        select(Profile.user_id).where(Profile.username == username)
    ).scalar_one()
    ranking = Ranking(
        user_id=user_id,
        song_id=song.id,
        bucket=bucket,
        position=1,
        score=score,
    )
    db.add(ranking)
    db.commit()
    return ranking


def _get_verdicts(client: TestClient, token: str, username: str | None = None) -> dict:
    limiter._storage.reset()
    if username is None:
        path = "/api/v1/profile/me/recent-verdicts"
    else:
        path = f"/api/v1/profile/{username}/recent-verdicts"
    response = client.get(path, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    return response.json()


def _get_rankings(client: TestClient, token: str, username: str) -> dict:
    limiter._storage.reset()
    response = client.get(
        f"/api/v1/profile/{username}/rankings",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


# ── Recent Verdicts ──────────────────────────────────────────────────────────


def test_owner_sees_own_recent_verdicts(client: TestClient, db_session: Session):
    """Owner always sees their own verdicts via the /me endpoint."""
    token = _register(client, "owner1")
    song = _create_song(db_session, 10001, "Owner Song")
    _create_verdict(db_session, "owner1", song)

    data = _get_verdicts(client, token)

    assert len(data["items"]) == 1
    assert data["items"][0]["song"]["title"] == "Owner Song"


def test_public_viewer_sees_public_recent_verdicts(client: TestClient, db_session: Session):
    """A public viewer can see verdicts from a public profile."""
    owner_token = _register(client, "pubowner")
    viewer_token = _register(client, "pubviewer")
    song = _create_song(db_session, 10002, "Public Song")
    _create_verdict(db_session, "pubowner", song)

    data = _get_verdicts(client, viewer_token, "pubowner")

    assert len(data["items"]) == 1
    assert data["items"][0]["song"]["title"] == "Public Song"
    _ = owner_token  # used for setup only


def test_friends_only_allowed_viewer_sees_verdicts(client: TestClient, db_session: Session):
    """Mutual-follow viewer can see friends-only verdicts."""
    owner_token = _register(client, "fowner")
    viewer_token = _register(client, "fviewer")
    _set_visibility(client, owner_token, "friends_only")
    _follow(client, viewer_token, "fowner")
    _follow(client, owner_token, "fviewer")
    song = _create_song(db_session, 10003, "Friends Song")
    _create_verdict(db_session, "fowner", song)

    data = _get_verdicts(client, viewer_token, "fowner")

    assert len(data["items"]) == 1


def test_friends_only_disallowed_viewer_gets_empty_verdicts(client: TestClient, db_session: Session):
    """Non-mutual viewer cannot see friends-only verdicts — notes never leak."""
    owner_token = _register(client, "fowner2")
    viewer_token = _register(client, "fviewer2")
    _set_visibility(client, owner_token, "friends_only")
    song = _create_song(db_session, 10004, "Hidden Song")
    _create_verdict(db_session, "fowner2", song, note="secret note")

    data = _get_verdicts(client, viewer_token, "fowner2")

    assert data["items"] == []


def test_only_me_viewer_gets_empty_verdicts(client: TestClient, db_session: Session):
    """Only-me profile: no other user sees verdicts."""
    owner_token = _register(client, "private1")
    viewer_token = _register(client, "viewer_pm")
    _set_visibility(client, owner_token, "only_me")
    song = _create_song(db_session, 10005, "Private Song")
    _create_verdict(db_session, "private1", song)

    data = _get_verdicts(client, viewer_token, "private1")

    assert data["items"] == []


def test_blocked_user_gets_empty_verdicts(client: TestClient, db_session: Session):
    """Owner-blocked viewer cannot see verdicts."""
    owner_token = _register(client, "blockowner")
    viewer_token = _register(client, "blockviewer")
    _block(client, owner_token, "blockviewer")
    song = _create_song(db_session, 10006, "Blocked Song")
    _create_verdict(db_session, "blockowner", song)

    data = _get_verdicts(client, viewer_token, "blockowner")

    assert data["items"] == []
    _ = owner_token


def test_verdicts_returned_newest_first(client: TestClient, db_session: Session):
    """Verdicts are ordered newest first."""
    token = _register(client, "ordowner")
    song_a = _create_song(db_session, 10007, "Older Song")
    song_b = _create_song(db_session, 10008, "Newer Song")
    _create_verdict(
        db_session, "ordowner", song_a,
        created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    _create_verdict(
        db_session, "ordowner", song_b,
        created_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
    )

    data = _get_verdicts(client, token)

    titles = [item["song"]["title"] for item in data["items"]]
    assert titles[0] == "Newer Song"
    assert titles[1] == "Older Song"


def test_note_included_in_visible_verdict(client: TestClient, db_session: Session):
    """Note field is returned when the verdict is visible."""
    token = _register(client, "noteowner")
    song = _create_song(db_session, 10009, "Note Song")
    _create_verdict(db_session, "noteowner", song, note="great bassline")

    data = _get_verdicts(client, token)

    assert data["items"][0]["note"] == "great bassline"


# ── Rankings Preview ─────────────────────────────────────────────────────────


def test_owner_sees_own_rankings(client: TestClient, db_session: Session):
    """Owner can fetch their own rankings via the username endpoint."""
    token = _register(client, "rankowner")
    song = _create_song(db_session, 20001, "Rank Song")
    _create_ranking(db_session, "rankowner", song)

    data = _get_rankings(client, token, "rankowner")

    assert len(data["rankings"]) == 1
    assert data["rankings"][0]["song"]["title"] == "Rank Song"


def test_public_viewer_sees_public_rankings(client: TestClient, db_session: Session):
    """Public viewer can see rankings of a public profile."""
    owner_token = _register(client, "pubrank")
    viewer_token = _register(client, "rankviewer")
    song = _create_song(db_session, 20002, "Visible Rank")
    _create_ranking(db_session, "pubrank", song)

    data = _get_rankings(client, viewer_token, "pubrank")

    assert len(data["rankings"]) == 1
    _ = owner_token


def test_friends_only_allowed_viewer_sees_rankings(client: TestClient, db_session: Session):
    """Mutual-follow viewer sees friends-only rankings."""
    owner_token = _register(client, "frrank")
    viewer_token = _register(client, "frviewer")
    _set_visibility(client, owner_token, "friends_only")
    _follow(client, viewer_token, "frrank")
    _follow(client, owner_token, "frviewer")
    song = _create_song(db_session, 20003, "Friend Rank")
    _create_ranking(db_session, "frrank", song)

    data = _get_rankings(client, viewer_token, "frrank")

    assert len(data["rankings"]) == 1


def test_only_me_viewer_gets_empty_rankings(client: TestClient, db_session: Session):
    """Only-me profile: no other viewer sees rankings."""
    owner_token = _register(client, "privrank")
    viewer_token = _register(client, "prviewer")
    _set_visibility(client, owner_token, "only_me")
    song = _create_song(db_session, 20004, "Private Rank")
    _create_ranking(db_session, "privrank", song)

    data = _get_rankings(client, viewer_token, "privrank")

    assert data["rankings"] == []
