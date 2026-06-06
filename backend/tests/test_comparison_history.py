"""Integration tests for current-user Versus History."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.comparison_session import ComparisonSession
from src.sqlalchemy_tables.song import Song


def _register(
    client: TestClient,
    email: str,
    username: str,
) -> tuple[str, int]:
    """Register a user and return their token and ID."""
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


def _add_song(
    db: Session,
    deezer_id: int,
    title: str,
    artist: str,
    cover_url: str,
) -> Song:
    """Persist one song for a comparison receipt."""
    song = Song(
        deezer_id=deezer_id,
        title=title,
        artist=artist,
        artist_deezer_id=deezer_id + 1000,
        album="Test Album",
        cover_url=cover_url,
    )
    db.add(song)
    db.flush()
    return song


def _add_comparison(
    db: Session,
    user_id: int,
    song_a: Song,
    song_b: Song,
    winner: Song,
    finalized_at: datetime | None,
    bucket: str | None = None,
    decision_duration_ms: int | None = None,
    comparison_index_in_session: int | None = None,
    session_uuid: uuid.UUID | None = None,
) -> Comparison:
    """Persist one comparison row with caller-controlled receipt fields."""
    comparison = Comparison(
        session_uuid=session_uuid or uuid.uuid4(),
        user_id=user_id,
        song_a_id=song_a.id,
        song_b_id=song_b.id,
        winner_id=winner.id,
        bucket=bucket,
        decision_duration_ms=decision_duration_ms,
        comparison_index_in_session=comparison_index_in_session,
        created_at=(finalized_at or datetime.now(timezone.utc)) - timedelta(seconds=1),
        finalized_at=finalized_at,
    )
    db.add(comparison)
    db.flush()
    return comparison


def test_versus_history_requires_auth(client: TestClient) -> None:
    """Anonymous callers cannot read Versus History."""
    response = client.get("/api/v1/rankings/me/versus-history")

    assert response.status_code == 401


def test_versus_history_returns_only_current_user_receipts_newest_first(
    client: TestClient,
    db_session: Session,
) -> None:
    """Versus History is owner-scoped and reverse chronological."""
    token, user_id = _register(client, "owner@example.com", "owner")
    _, other_user_id = _register(client, "other@example.com", "other")
    winner = _add_song(db_session, 1001, "Winner", "Winner Artist", "https://example.com/winner.jpg")
    loser = _add_song(db_session, 1002, "Loser", "Loser Artist", "https://example.com/loser.jpg")
    now = datetime.now(timezone.utc)
    older = _add_comparison(
        db_session,
        user_id,
        winner,
        loser,
        winner,
        finalized_at=now - timedelta(hours=1),
    )
    newer = _add_comparison(
        db_session,
        user_id,
        winner,
        loser,
        loser,
        finalized_at=now,
    )
    _add_comparison(
        db_session,
        other_user_id,
        winner,
        loser,
        winner,
        finalized_at=now + timedelta(hours=1),
    )
    db_session.commit()

    response = client.get(
        "/api/v1/rankings/me/versus-history",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    receipts = response.json()["receipts"]
    assert [receipt["id"] for receipt in receipts] == [newer.id, older.id]
    assert receipts[0]["winner_song_id"] == loser.id
    assert receipts[0]["loser_song_id"] == winner.id


def test_versus_history_returns_receipt_details(
    client: TestClient,
    db_session: Session,
) -> None:
    """Versus History exposes song metadata and captured comparison context."""
    token, user_id = _register(client, "details@example.com", "details")
    winner = _add_song(db_session, 2001, "Winner", "Winner Artist", "https://example.com/winner.jpg")
    loser = _add_song(db_session, 2002, "Loser", "Loser Artist", "https://example.com/loser.jpg")
    session_uuid = uuid.uuid4()
    finalized_at = datetime.now(timezone.utc)
    comparison = _add_comparison(
        db_session,
        user_id,
        loser,
        winner,
        winner,
        finalized_at=finalized_at,
        bucket="alright",
        decision_duration_ms=1834,
        comparison_index_in_session=2,
        session_uuid=session_uuid,
    )
    db_session.commit()

    response = client.get(
        "/api/v1/rankings/me/versus-history",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    receipt = response.json()["receipts"][0]
    assert datetime.fromisoformat(receipt.pop("finalized_at")) == finalized_at
    assert receipt == {
        "id": comparison.id,
        "winner_song_id": winner.id,
        "winner_title": "Winner",
        "winner_artist": "Winner Artist",
        "winner_cover_url": "https://example.com/winner.jpg",
        "loser_song_id": loser.id,
        "loser_title": "Loser",
        "loser_artist": "Loser Artist",
        "loser_cover_url": "https://example.com/loser.jpg",
        "bucket": "alright",
        "decision_duration_ms": 1834,
        "comparison_session_uuid": str(session_uuid),
        "comparison_index_in_session": 2,
    }


def test_versus_history_excludes_active_and_unfinalized_comparisons(
    client: TestClient,
    db_session: Session,
) -> None:
    """Temporary sessions and incomplete comparison rows never appear as receipts."""
    token, user_id = _register(client, "active@example.com", "active")
    song_a = _add_song(db_session, 3001, "Song A", "Artist A", "https://example.com/a.jpg")
    song_b = _add_song(db_session, 3002, "Song B", "Artist B", "https://example.com/b.jpg")
    _add_comparison(
        db_session,
        user_id,
        song_a,
        song_b,
        song_a,
        finalized_at=None,
    )
    db_session.add(
        ComparisonSession(
            session_uuid=uuid.uuid4(),
            user_id=user_id,
            song_payload={"deezer_id": 3003, "title": "Temporary Song"},
            bucket="like",
            low_index=0,
            high_index=1,
            decisions=[],
        )
    )
    db_session.commit()

    response = client.get(
        "/api/v1/rankings/me/versus-history",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"receipts": []}


def test_versus_history_empty_returns_empty_list(
    client: TestClient,
) -> None:
    """A user with no finalized comparisons receives an empty receipt list."""
    token, _ = _register(client, "empty@example.com", "empty")

    response = client.get(
        "/api/v1/rankings/me/versus-history",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"receipts": []}


def test_versus_history_is_limited_to_recent_fifty(
    client: TestClient,
    db_session: Session,
) -> None:
    """MVP Versus History returns only the latest 50 finalized receipts."""
    token, user_id = _register(client, "limit@example.com", "limituser")
    song_a = _add_song(db_session, 4001, "Song A", "Artist A", "https://example.com/a.jpg")
    song_b = _add_song(db_session, 4002, "Song B", "Artist B", "https://example.com/b.jpg")
    now = datetime.now(timezone.utc)
    comparisons = [
        _add_comparison(
            db_session,
            user_id,
            song_a,
            song_b,
            song_a,
            finalized_at=now + timedelta(seconds=index),
        )
        for index in range(51)
    ]
    db_session.commit()

    response = client.get(
        "/api/v1/rankings/me/versus-history",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    receipts = response.json()["receipts"]
    assert len(receipts) == 50
    assert receipts[0]["id"] == comparisons[-1].id
    assert receipts[-1]["id"] == comparisons[1].id
