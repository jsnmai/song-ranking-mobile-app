# Tests for Phase 12 — Friend Compatibility similarity computation.
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot
from tests.conftest import TestingSessionLocal

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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
            "display_name": "Test User",
            "username": username,
        },
    )
    data = response.json()
    return data["access_token"], data["user"]["id"]


def _rate(
    client: TestClient,
    token: str,
    deezer_id: int,
    artist: str = "Test Artist",
    bucket: str = "like",
    genre_deezer: str | None = None,
    title: str = "Test Song",
) -> None:
    """Finalize one rating into an empty bucket — no comparison required."""
    client.post(
        "/api/v1/ratings/finalize",
        json={
            "song": {
                "deezer_id": deezer_id,
                "isrc": None,
                "title": title,
                "artist": artist,
                "artist_deezer_id": 1,
                "album": "Test Album",
                "cover_url": "https://example.com/cover.jpg",
                "preview_url": None,
                "genre_deezer": genre_deezer,
            },
            "bucket": bucket,
        },
        headers={"Authorization": f"Bearer {token}"},
    )


def _rate_n_shared(
    client: TestClient,
    token_a: str,
    token_b: str,
    n: int,
    genre_deezer: str | None = "Rock",
    artist: str = "Frank Ocean",
    start_deezer_id: int = 5000,
) -> None:
    """Rate n songs with both users using identical deezer_ids."""
    for i in range(n):
        deezer_id = start_deezer_id + i
        _rate(client, token_a, deezer_id=deezer_id, artist=artist, genre_deezer=genre_deezer)
        _rate(client, token_b, deezer_id=deezer_id, artist=artist, genre_deezer=genre_deezer)


def _seed_shared_rankings(
    db: Session,
    uid_a: int,
    uid_b: int,
    n: int,
    start_deezer_id: int = 5000,
    genre_deezer: str | None = "Rock",
    score: float = 8.0,
) -> None:
    """
    Insert n songs and rankings for both users directly into the test DB.

    Bypasses the HTTP comparison flow so tests that need >= 5 shared songs don't
    have to go through a full comparison session for each song after the first.
    """
    for i in range(n):
        song = Song(
            deezer_id=start_deezer_id + i,
            title=f"Test Song {start_deezer_id + i}",
            artist="Test Artist",
            artist_deezer_id=1,
            album="Test Album",
            cover_url="https://example.com/cover.jpg",
            genre_deezer=genre_deezer,
        )
        db.add(song)
        db.flush()
        db.add(Ranking(user_id=uid_a, song_id=song.id, bucket="like", position=start_deezer_id + i, score=score))
        db.add(Ranking(user_id=uid_b, song_id=song.id, bucket="like", position=start_deezer_id + i, score=score))
    db.commit()


# ---------------------------------------------------------------------------
# Unit tests for v1_cosine algorithm (no HTTP, no database)
# ---------------------------------------------------------------------------


def test_v1_cosine_identical_scores_give_score_1() -> None:
    """Cosine similarity of identical positive vectors is exactly 1.0."""
    from src.services.similarity.v1_cosine import compute

    scores = {1: 9.0, 2: 8.0, 3: 7.0, 4: 6.0, 5: 5.0}
    genres = {i: "Rock" for i in scores}
    artists = {i: "Frank Ocean" for i in scores}

    result = compute(scores, scores, genres, artists)

    assert result is not None
    assert result.shared_song_count == 5
    assert abs(result.similarity_score - 1.0) < 1e-4
    assert result.score_distance_avg == 0.0
    assert "Frank Ocean" in result.shared_top_artists
    assert "Rock" in result.shared_genres


def test_v1_cosine_different_scores_give_score_below_1() -> None:
    """Cosine similarity drops below 1.0 when score vectors differ."""
    from src.services.similarity.v1_cosine import compute

    scores_a = {1: 9.0, 2: 2.0, 3: 7.0, 4: 1.0, 5: 9.0}
    scores_b = {1: 1.0, 2: 9.0, 3: 1.0, 4: 9.0, 5: 1.0}
    genres = {i: "Pop" for i in scores_a}
    artists = {i: "Kendrick Lamar" for i in scores_a}

    result = compute(scores_a, scores_b, genres, artists)

    assert result is not None
    assert result.similarity_score < 1.0
    assert result.similarity_score >= 0.0


def test_v1_cosine_fewer_than_5_shared_songs_returns_none() -> None:
    """Returns None when fewer than 5 songs are shared — threshold for a meaningful signal."""
    from src.services.similarity.v1_cosine import compute

    scores_a = {1: 9.0, 2: 8.0, 3: 7.0, 4: 6.0}
    scores_b = {1: 9.0, 2: 8.0, 3: 7.0, 4: 6.0}
    genres = {i: "Jazz" for i in scores_a}
    artists = {i: "Miles Davis" for i in scores_a}

    result = compute(scores_a, scores_b, genres, artists)

    assert result is None


def test_v1_cosine_unknown_genre_excluded_from_shared_genres() -> None:
    """Unknown genres are excluded from shared_genres; they are not useful for explanation phrases."""
    from src.services.similarity.v1_cosine import compute

    scores = {i: 8.0 for i in range(1, 6)}
    genres = {i: "Unknown" for i in scores}
    artists = {i: "Artist" for i in scores}

    result = compute(scores, scores, genres, artists)

    assert result is not None
    assert "Unknown" not in result.shared_genres


def test_v1_cosine_score_distance_avg_is_correct() -> None:
    """score_distance_avg is the average absolute score difference."""
    from src.services.similarity.v1_cosine import compute

    scores_a = {1: 9.0, 2: 9.0, 3: 9.0, 4: 9.0, 5: 9.0}
    scores_b = {1: 5.0, 2: 5.0, 3: 5.0, 4: 5.0, 5: 5.0}
    genres = {i: "Rock" for i in scores_a}
    artists = {i: "Artist" for i in scores_a}

    result = compute(scores_a, scores_b, genres, artists)

    assert result is not None
    assert abs(result.score_distance_avg - 4.0) < 1e-4


# ---------------------------------------------------------------------------
# Integration tests — canonical ordering and snapshot persistence
# ---------------------------------------------------------------------------


def test_canonical_ordering_enforced(
    client: TestClient,
    db_session: Session,
    monkeypatch,
) -> None:
    """user_a_id < user_b_id regardless of which user triggered the task."""
    monkeypatch.setattr("src.services.similarity_tasks.SessionLocal", TestingSessionLocal)

    # Register user B first so uid_b < uid_a. The snapshot must still store
    # user_a_id = uid_b (the smaller ID) regardless of who triggers the task.
    token_b, uid_b = _register(client, "canob@example.com", "canob")
    token_a, uid_a = _register(client, "canoa@example.com", "canoa")
    assert uid_b < uid_a

    # Seed 5 shared songs directly so both users clear the >= 5 threshold.
    # _rate would 409 for songs 2-5 (non-empty bucket requires a comparison session).
    _seed_shared_rankings(db_session, uid_a, uid_b, n=5, start_deezer_id=5000)

    # Call the task directly — it uses TestingSessionLocal via the monkeypatch.
    from src.services.similarity_tasks import refresh_similarity_for_user_task
    refresh_similarity_for_user_task(uid_a)

    snapshots = db_session.query(UserSimilaritySnapshot).all()
    assert len(snapshots) == 1
    snap = snapshots[0]
    assert snap.user_a_id == uid_b
    assert snap.user_b_id == uid_a
    assert snap.user_a_id < snap.user_b_id


def test_upsert_updates_not_duplicates(
    client: TestClient,
    db_session: Session,
    monkeypatch,
) -> None:
    """Adding more shared songs after the first snapshot updates the row, not duplicates it."""
    monkeypatch.setattr("src.services.similarity_tasks.SessionLocal", TestingSessionLocal)

    token_a, uid_a = _register(client, "upserta@example.com", "upserta")
    token_b, uid_b = _register(client, "upsertb@example.com", "upsertb")

    from src.services.similarity_tasks import refresh_similarity_for_user_task

    # Seed 5 shared songs and run the task — should create exactly 1 snapshot.
    _seed_shared_rankings(db_session, uid_a, uid_b, n=5, start_deezer_id=6000)
    refresh_similarity_for_user_task(uid_a)
    assert db_session.query(UserSimilaritySnapshot).count() == 1

    # Seed a 6th shared song and run the task again — should UPDATE, not insert.
    _seed_shared_rankings(db_session, uid_a, uid_b, n=1, start_deezer_id=6005)
    refresh_similarity_for_user_task(uid_a)

    assert db_session.query(UserSimilaritySnapshot).count() == 1
    snap = db_session.query(UserSimilaritySnapshot).one()
    assert snap.shared_song_count == 6


def test_fewer_than_5_shared_songs_no_snapshot_written(
    client: TestClient,
    db_session: Session,
    monkeypatch,
) -> None:
    """No snapshot is written when users share fewer than 5 rated songs."""
    monkeypatch.setattr("src.services.similarity_tasks.SessionLocal", TestingSessionLocal)

    token_a, uid_a = _register(client, "few_a@example.com", "fewa")
    token_b, uid_b = _register(client, "few_b@example.com", "fewb")

    _seed_shared_rankings(db_session, uid_a, uid_b, n=4, start_deezer_id=7000)

    from src.services.similarity_tasks import refresh_similarity_for_user_task
    refresh_similarity_for_user_task(uid_a)

    assert db_session.query(UserSimilaritySnapshot).count() == 0


def test_task_swallows_all_exceptions(monkeypatch) -> None:
    """Errors inside the task are logged and swallowed — they never propagate."""
    from src.services.similarity_tasks import refresh_similarity_for_user_task

    def always_raise(*args, **kwargs):
        raise RuntimeError("simulated inner failure")

    monkeypatch.setattr(
        "src.services.similarity_tasks.get_similarity_rows",
        always_raise,
    )

    # Must not raise
    refresh_similarity_for_user_task(user_id=1)


# ---------------------------------------------------------------------------
# Router wiring tests — verify tasks are scheduled, not computed inline
# ---------------------------------------------------------------------------


def test_rating_finalize_schedules_similarity_refresh(
    client: TestClient,
    monkeypatch,
) -> None:
    """Rating finalize schedules refresh_similarity_for_user_task without computing inline."""
    calls: list[int] = []

    def mock_task(user_id: int) -> None:
        calls.append(user_id)

    monkeypatch.setattr(
        "src.api_routers.rating.refresh_similarity_for_user_task",
        mock_task,
    )

    token, user_id = _register(client, "rfsched@example.com", "rfsched")
    _rate(client, token, deezer_id=8001)

    assert user_id in calls


def test_comparison_finalize_schedules_similarity_refresh(
    client: TestClient,
    monkeypatch,
) -> None:
    """Comparison finalize schedules refresh_similarity_for_user_task without computing inline."""
    token, user_id = _register(client, "cfsched@example.com", "cfsched")

    # Rate first song to create a non-empty like bucket
    _rate(client, token, deezer_id=9001, title="Song One")

    # Start a comparison session for a second song in the same bucket
    session_resp = client.post(
        "/api/v1/comparison-sessions",
        json={
            "song": {
                "deezer_id": 9002,
                "isrc": None,
                "title": "Song Two",
                "artist": "Test Artist",
                "artist_deezer_id": 1,
                "album": "Test Album",
                "cover_url": "https://example.com/cover.jpg",
                "preview_url": None,
                "genre_deezer": None,
            },
            "bucket": "like",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert session_resp.status_code == 201
    session_data = session_resp.json()
    session_uuid = session_data["session_uuid"]

    # Make the one required comparison choice (bucket has 1 song → 1 comparison)
    client.post(
        f"/api/v1/comparison-sessions/{session_uuid}/choices",
        json={"winner": "candidate"},
        headers={"Authorization": f"Bearer {token}"},
    )

    # Now patch the task before finalize so we capture only this call
    calls: list[int] = []

    def mock_task(uid: int) -> None:
        calls.append(uid)

    monkeypatch.setattr(
        "src.api_routers.comparison.refresh_similarity_for_user_task",
        mock_task,
    )

    finalize_resp = client.post(
        f"/api/v1/comparison-sessions/{session_uuid}/finalize",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert finalize_resp.status_code == 200
    assert calls == [user_id]
