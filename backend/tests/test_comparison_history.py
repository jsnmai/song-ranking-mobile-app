"""Integration tests for current-user Versus History."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.crud.comparison_history import list_user_comparison_history
from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.comparison_session import ComparisonSession
from src.sqlalchemy_tables.ranking import Ranking
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


def _add_ranking(
    db: Session,
    user_id: int,
    song: Song,
    bucket: str = "like",
    position: int = 1,
    score: float = 8.0,
) -> Ranking:
    """Mark a song as currently rated by the user (a receipt is shown only when
    both of its songs have a ranking row)."""
    ranking = Ranking(
        user_id=user_id,
        song_id=song.id,
        bucket=bucket,
        position=position,
        score=score,
    )
    db.add(ranking)
    db.flush()
    return ranking


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
    _add_ranking(db_session, user_id, winner, position=1)
    _add_ranking(db_session, user_id, loser, position=2)
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
    _add_ranking(db_session, user_id, winner, position=1)
    _add_ranking(db_session, user_id, loser, position=2)
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
    _add_ranking(db_session, user_id, song_a, position=1)
    _add_ranking(db_session, user_id, song_b, position=2)
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


def test_versus_history_excludes_receipt_when_a_song_is_unrated(
    client: TestClient,
    db_session: Session,
) -> None:
    """Un-rating a song hides its receipts while the comparison row is retained."""
    token, user_id = _register(client, "unrate@example.com", "unrate")
    winner = _add_song(db_session, 5001, "Winner", "Winner Artist", "https://example.com/winner.jpg")
    loser = _add_song(db_session, 5002, "Loser", "Loser Artist", "https://example.com/loser.jpg")
    _add_ranking(db_session, user_id, winner, position=1)
    loser_ranking = _add_ranking(db_session, user_id, loser, position=2)
    _add_comparison(
        db_session,
        user_id,
        winner,
        loser,
        winner,
        finalized_at=datetime.now(timezone.utc),
    )
    db_session.commit()

    headers = {"Authorization": f"Bearer {token}"}
    before = client.get("/api/v1/rankings/me/versus-history", headers=headers)
    assert before.status_code == 200
    assert len(before.json()["receipts"]) == 1

    # Un-rate one song (deletes the ranking; the comparison row is left intact —
    # this mirrors what remove_rating does, covered end-to-end in test_rating.py).
    db_session.delete(loser_ranking)
    db_session.commit()

    after = client.get("/api/v1/rankings/me/versus-history", headers=headers)
    assert after.status_code == 200
    assert after.json()["receipts"] == []

    # The comparison data is retained for analytics.
    comparison_count = db_session.scalar(select(func.count()).select_from(Comparison))
    assert comparison_count == 1


def test_versus_history_excludes_receipt_when_either_song_unrated(
    client: TestClient,
    db_session: Session,
) -> None:
    """A receipt requires BOTH songs to be rated — removing either hides it."""
    token, user_id = _register(client, "either@example.com", "either")
    winner = _add_song(db_session, 5101, "Winner", "Winner Artist", "https://example.com/winner.jpg")
    loser = _add_song(db_session, 5102, "Loser", "Loser Artist", "https://example.com/loser.jpg")
    winner_ranking = _add_ranking(db_session, user_id, winner, position=1)
    _add_ranking(db_session, user_id, loser, position=2)
    _add_comparison(
        db_session,
        user_id,
        winner,
        loser,
        winner,
        finalized_at=datetime.now(timezone.utc),
    )
    # Remove only the winner's ranking (loser stays rated).
    db_session.delete(winner_ranking)
    db_session.commit()

    response = client.get(
        "/api/v1/rankings/me/versus-history",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["receipts"] == []


def test_versus_history_only_rated_false_returns_unrated_receipts(
    client: TestClient,
    db_session: Session,
) -> None:
    """only_rated=False yields the full raw history (analytics / future features)."""
    _, user_id = _register(client, "raw@example.com", "rawuser")
    winner = _add_song(db_session, 5201, "Winner", "Winner Artist", "https://example.com/winner.jpg")
    loser = _add_song(db_session, 5202, "Loser", "Loser Artist", "https://example.com/loser.jpg")
    # Only the winner is rated; the loser was never rated (or un-rated).
    _add_ranking(db_session, user_id, winner, position=1)
    _add_comparison(
        db_session,
        user_id,
        winner,
        loser,
        winner,
        finalized_at=datetime.now(timezone.utc),
    )
    db_session.commit()

    filtered = list_user_comparison_history(db_session, user_id=user_id, limit=50)
    assert filtered == []

    full = list_user_comparison_history(
        db_session, user_id=user_id, limit=50, only_rated=False
    )
    assert len(full) == 1
    assert {full[0].song_a.id, full[0].song_b.id} == {winner.id, loser.id}


def test_versus_history_limit_applies_after_rated_filter(
    client: TestClient,
    db_session: Session,
) -> None:
    """The 50-row limit is taken over the rated set, not before filtering."""
    token, user_id = _register(client, "limitfilter@example.com", "limitfilter")
    song_a = _add_song(db_session, 5301, "Song A", "Artist A", "https://example.com/a.jpg")
    song_b = _add_song(db_session, 5302, "Song B", "Artist B", "https://example.com/b.jpg")
    unrated = _add_song(db_session, 5303, "Unrated", "Artist C", "https://example.com/c.jpg")
    _add_ranking(db_session, user_id, song_a, position=1)
    _add_ranking(db_session, user_id, song_b, position=2)
    now = datetime.now(timezone.utc)
    # 50 rated comparisons...
    for index in range(50):
        _add_comparison(
            db_session,
            user_id,
            song_a,
            song_b,
            song_a,
            finalized_at=now + timedelta(seconds=index),
        )
    # ...plus 5 newer comparisons against an un-rated song. If filtering ran
    # after the limit, these would steal slots and drop the count below 50.
    for index in range(5):
        _add_comparison(
            db_session,
            user_id,
            song_a,
            unrated,
            song_a,
            finalized_at=now + timedelta(seconds=100 + index),
        )
    db_session.commit()

    response = client.get(
        "/api/v1/rankings/me/versus-history",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    receipts = response.json()["receipts"]
    assert len(receipts) == 50
    rated_ids = {song_a.id, song_b.id}
    for receipt in receipts:
        assert receipt["winner_song_id"] in rated_ids
        assert receipt["loser_song_id"] in rated_ids
