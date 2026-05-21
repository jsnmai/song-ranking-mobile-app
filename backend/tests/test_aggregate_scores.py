# Integration tests for Phase 10 global aggregate scores on the songs table.
# Verifies that global_avg_score and global_rating_count are maintained correctly
# across new ratings, rerates, removals, and reorders.
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.song import Song


def _register_payload(
    email: str,
    username: str,
) -> dict:
    """Return a valid register payload with caller-provided identity fields."""
    return {
        "email": email,
        "password": "password123",
        "display_name": username.title(),
        "username": username,
    }


def _get_token(
    client: TestClient,
    email: str = "user@example.com",
    username: str = "testuser",
) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post(
        "/api/v1/auth/register",
        json=_register_payload(email, username),
    )
    return response.json()["access_token"]


def _rating_payload(
    deezer_id: int = 123,
    bucket: str = "like",
    position: int | None = None,
) -> dict:
    """Return a finalize-rating payload for a Deezer song."""
    payload = {
        "song": {
            "deezer_id": deezer_id,
            "isrc": "USUG11900842",
            "title": "Nights",
            "artist": "Frank Ocean",
            "artist_deezer_id": 456,
            "album": "Blonde",
            "cover_url": "https://example.com/cover.jpg",
            "preview_url": None,
            "genre_deezer": None,
        },
        "bucket": bucket,
    }
    if position is not None:
        payload["position"] = position
    return payload


def _finalize(
    client: TestClient,
    token: str,
    deezer_id: int = 123,
    bucket: str = "like",
    position: int | None = None,
) -> dict:
    """Finalize a rating and return the parsed response body."""
    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(deezer_id, bucket, position),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def _get_song(db_session: Session, deezer_id: int = 123) -> Song:
    """Fetch a song row directly from the database."""
    return db_session.execute(
        select(Song)
        .where(Song.deezer_id == deezer_id)
    ).scalar_one()


def test_new_rating_sets_aggregates(
    client: TestClient,
    db_session: Session,
):
    """First rating of a song sets count=1 and avg equal to the assigned score."""
    token = _get_token(client)
    result = _finalize(client, token, bucket="like")
    assigned_score = result["ranking"]["score"]

    db_session.expire_all()
    song = _get_song(db_session)

    assert song.global_rating_count == 1
    assert song.global_avg_score == assigned_score


def test_second_user_rating_updates_aggregates(
    client: TestClient,
    db_session: Session,
):
    """Two users rating the same song produces count=2 and the mean of both scores."""
    token_a = _get_token(client, "a@example.com", "userA")
    token_b = _get_token(client, "b@example.com", "userB")

    result_a = _finalize(client, token_a, bucket="like")
    result_b = _finalize(client, token_b, bucket="dislike")

    score_a = result_a["ranking"]["score"]
    score_b = result_b["ranking"]["score"]
    expected_avg = (score_a + score_b) / 2

    db_session.expire_all()
    song = _get_song(db_session)

    assert song.global_rating_count == 2
    assert abs(song.global_avg_score - expected_avg) < 0.001


def test_rerate_updates_aggregates(
    client: TestClient,
    db_session: Session,
):
    """Re-rating a song to a different bucket updates count and avg correctly."""
    token = _get_token(client)
    _finalize(client, token, bucket="like")

    # Re-rate the same song to dislike — count should stay 1, avg should change.
    result = _finalize(client, token, bucket="dislike")
    new_score = result["ranking"]["score"]

    db_session.expire_all()
    song = _get_song(db_session)

    assert song.global_rating_count == 1
    assert song.global_avg_score == new_score


def test_remove_rating_decrements_aggregates(
    client: TestClient,
    db_session: Session,
):
    """Two users rate a song; removing one updates count and avg to the remaining user's score."""
    token_a = _get_token(client, "a@example.com", "userA")
    token_b = _get_token(client, "b@example.com", "userB")

    result_a = _finalize(client, token_a, bucket="like")
    result_b = _finalize(client, token_b, bucket="dislike")
    score_b = result_b["ranking"]["score"]
    song_id = result_a["ranking"]["song_id"]

    client.delete(
        f"/api/v1/ratings/{song_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    db_session.expire_all()
    song = _get_song(db_session)

    assert song.global_rating_count == 1
    assert abs(song.global_avg_score - score_b) < 0.001


def test_remove_last_rating_clears_aggregates(
    client: TestClient,
    db_session: Session,
):
    """Removing the only rating resets count to 0 and avg to null."""
    token = _get_token(client)
    result = _finalize(client, token, bucket="like")
    song_id = result["ranking"]["song_id"]

    client.delete(
        f"/api/v1/ratings/{song_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    db_session.expire_all()
    song = _get_song(db_session)

    assert song.global_rating_count == 0
    assert song.global_avg_score is None


def test_reorder_updates_aggregates_for_all_songs(
    client: TestClient,
    db_session: Session,
):
    """Reordering updates global_avg_score for all songs that changed position."""
    token = _get_token(client)

    # Rate two songs so both get positions in the like bucket.
    result_a = _finalize(client, token, deezer_id=111, bucket="like")
    result_b = _finalize(client, token, deezer_id=222, bucket="like", position=2)
    song_id_a = result_a["ranking"]["song_id"]
    song_id_b = result_b["ranking"]["song_id"]

    # Swap order: put 222 first, 111 second.
    response = client.put(
        "/api/v1/rankings/reorder",
        json={
            "rankings": [
                {"song_id": song_id_b, "bucket": "like"},
                {"song_id": song_id_a, "bucket": "like"},
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    db_session.expire_all()
    song_a = db_session.execute(
        select(Song)
        .where(Song.id == song_id_a)
    ).scalar_one()
    song_b = db_session.execute(
        select(Song)
        .where(Song.id == song_id_b)
    ).scalar_one()

    # Both songs have exactly one rater; avg must equal their current individual score.
    updated_rankings = response.json()["rankings"]
    score_by_song_id = {r["song_id"]: r["score"] for r in updated_rankings}

    assert song_a.global_rating_count == 1
    assert abs(song_a.global_avg_score - score_by_song_id[song_id_a]) < 0.001
    assert song_b.global_rating_count == 1
    assert abs(song_b.global_avg_score - score_by_song_id[song_id_b]) < 0.001


def test_reorder_with_bucket_crossing_updates_all_aggregates(
    client: TestClient,
    db_session: Session,
):
    """
    Reordering that crosses bucket boundaries recomputes aggregates for every song
    in the payload, including songs that only changed position within a bucket.

    After the reorder, song_A moves from like/position-1 to like/position-2 without
    crossing a bucket boundary. Its score drops from 10.0 to 7.5. If reorder_rankings
    only recomputed the two bucket-crossers (affected_song_ids), song_A's aggregate
    would remain stale at 10.0. The all_reordered_song_ids loop must cover it too.
    """
    token = _get_token(client)

    # Rate 2 songs into like and 1 into alright.
    result_a = _finalize(client, token, deezer_id=111, bucket="like")
    result_b = _finalize(client, token, deezer_id=222, bucket="like", position=2)
    result_c = _finalize(client, token, deezer_id=333, bucket="alright")

    song_id_a = result_a["ranking"]["song_id"]
    song_id_b = result_b["ranking"]["song_id"]
    song_id_c = result_c["ranking"]["song_id"]

    # C (alright → like/1), A (like/1 → like/2, non-crosser), B (like/2 → alright/1).
    response = client.put(
        "/api/v1/rankings/reorder",
        json={
            "rankings": [
                {"song_id": song_id_c, "bucket": "like"},
                {"song_id": song_id_a, "bucket": "like"},
                {"song_id": song_id_b, "bucket": "alright"},
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    db_session.expire_all()
    song_a = db_session.execute(select(Song).where(Song.id == song_id_a)).scalar_one()
    song_b = db_session.execute(select(Song).where(Song.id == song_id_b)).scalar_one()
    song_c = db_session.execute(select(Song).where(Song.id == song_id_c)).scalar_one()

    # Each song has exactly one rater, so global_avg_score must equal its new score.
    # Derive expected scores from the response rather than hardcoding formula values.
    score_by_song_id = {r["song_id"]: r["score"] for r in response.json()["rankings"]}

    for song_obj, song_id in [
        (song_a, song_id_a),
        (song_b, song_id_b),
        (song_c, song_id_c),
    ]:
        assert song_obj.global_rating_count == 1
        assert abs(song_obj.global_avg_score - score_by_song_id[song_id]) < 0.001


def test_aggregate_fields_in_rankings_list_response(
    client: TestClient,
):
    """GET /rankings/me embeds global_avg_score and global_rating_count in each song object."""
    token = _get_token(client)
    finalize_result = _finalize(client, token, bucket="like")
    expected_score = finalize_result["ranking"]["score"]

    response = client.get(
        "/api/v1/rankings/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    rankings = response.json()["rankings"]
    assert len(rankings) == 1
    song_data = rankings[0]["song"]

    assert "global_avg_score" in song_data
    assert "global_rating_count" in song_data
    assert song_data["global_rating_count"] == 1
    assert abs(song_data["global_avg_score"] - expected_score) < 0.001


def test_aggregates_included_in_song_response(
    client: TestClient,
):
    """The finalize-rating response includes global_avg_score and global_rating_count on the song."""
    token = _get_token(client)
    result = _finalize(client, token, bucket="like")
    song_data = result["ranking"]["song"]

    assert "global_avg_score" in song_data
    assert "global_rating_count" in song_data
    assert song_data["global_rating_count"] == 1
    assert song_data["global_avg_score"] is not None


def test_aggregates_span_all_users_regardless_of_profile_visibility(
    client: TestClient,
    db_session: Session,
):
    """
    Aggregate scores include ratings from users with private profiles.

    is_public controls profile page visibility, not anonymous aggregate statistics.
    """
    token_a = _get_token(client, "a@example.com", "userA")
    token_b = _get_token(client, "b@example.com", "userB")

    # Make userB's profile private directly via DB — no profile-update endpoint exists yet.
    profile_b = db_session.execute(
        select(Profile)
        .where(Profile.username == "userb")
    ).scalar_one()
    profile_b.is_public = False
    db_session.commit()

    result_a = _finalize(client, token_a, bucket="like")
    result_b = _finalize(client, token_b, bucket="dislike")

    score_a = result_a["ranking"]["score"]
    score_b = result_b["ranking"]["score"]
    expected_avg = (score_a + score_b) / 2

    db_session.expire_all()
    song = _get_song(db_session)

    # Both ratings must contribute to the aggregate even though userB is private.
    assert song.global_rating_count == 2
    assert abs(song.global_avg_score - expected_avg) < 0.001
