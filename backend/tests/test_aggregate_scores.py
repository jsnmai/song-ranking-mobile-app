# Integration tests for Phase 10 global aggregate scores on the songs table.
# Verifies that global_avg_score and global_rating_count are maintained correctly
# across new ratings, rerates, removals, and reorders.
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.crud.song import adjust_song_aggregate, decrement_song_aggregate
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
    if position is not None:
        return _finalize_through_comparison(
            client,
            token,
            deezer_id,
            bucket,
            position,
        )

    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(deezer_id, bucket, position),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def _finalize_through_comparison(
    client: TestClient,
    token: str,
    deezer_id: int,
    bucket: str,
    requested_position: int,
) -> dict:
    """Drive the public comparison API until it finalizes the target at the requested position."""
    payload = _rating_payload(
        deezer_id,
        bucket,
    )
    response = client.post(
        "/api/v1/comparison-sessions",
        json={
            "song": payload["song"],
            "bucket": bucket,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    session = response.json()

    while session["status"] == "active":
        candidate_position = session["candidate_index"] + 1
        winner = "target" if requested_position <= candidate_position else "candidate"
        choice_response = client.post(
            f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
            json={"winner": winner},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert choice_response.status_code == 200
        session = choice_response.json()

    assert session["final_position"] == requested_position
    finalize_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert finalize_response.status_code == 200
    return finalize_response.json()["result"]


def _get_song(db_session: Session, deezer_id: int = 123) -> Song:
    """Fetch a song row directly from the database."""
    return db_session.execute(
        select(Song)
        .where(Song.deezer_id == deezer_id)
    ).scalar_one()


def _get_song_by_id(
    db_session: Session,
    song_id: int,
) -> Song:
    """Fetch a song row by LISTn's internal song id."""
    return db_session.execute(
        select(Song)
        .where(Song.id == song_id)
    ).scalar_one()


def _assert_aggregate(
    song: Song,
    count: int,
    rating_sum: float | None,
) -> None:
    """Assert count/sum/avg invariants for one song aggregate."""
    assert song.global_rating_count == count
    if count == 0:
        assert song.global_rating_sum is None
        assert song.global_avg_score is None
        return

    assert rating_sum is not None
    assert song.global_rating_sum is not None
    assert abs(song.global_rating_sum - rating_sum) < 0.001
    assert song.global_avg_score is not None
    assert abs(song.global_avg_score - (rating_sum / count)) < 0.001


def _ranking_scores_by_song_id(
    client: TestClient,
    token: str,
) -> dict[int, float]:
    """Return the current user's ranking scores keyed by song id."""
    response = client.get(
        "/api/v1/rankings/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return {
        ranking["song_id"]: ranking["score"]
        for ranking in response.json()["rankings"]
    }


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

    _assert_aggregate(
        song,
        1,
        assigned_score,
    )


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

    _assert_aggregate(
        song,
        2,
        score_a + score_b,
    )
    assert abs(song.global_avg_score - expected_avg) < 0.001


def test_new_rating_into_non_empty_bucket_updates_shifted_song_aggregates(
    client: TestClient,
    db_session: Session,
):
    """Inserting into a non-empty bucket adjusts existing songs that shift position."""
    token = _get_token(client)

    result_a = _finalize(client, token, deezer_id=111, bucket="like")
    result_b = _finalize(client, token, deezer_id=222, bucket="like", position=1)
    song_id_a = result_a["ranking"]["song_id"]
    song_id_b = result_b["ranking"]["song_id"]
    score_by_song_id = _ranking_scores_by_song_id(
        client,
        token,
    )

    db_session.expire_all()
    song_a = _get_song_by_id(
        db_session,
        song_id_a,
    )
    song_b = _get_song_by_id(
        db_session,
        song_id_b,
    )

    _assert_aggregate(
        song_a,
        1,
        score_by_song_id[song_id_a],
    )
    _assert_aggregate(
        song_b,
        1,
        score_by_song_id[song_id_b],
    )


def test_rerate_to_different_bucket_updates_aggregates(
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

    _assert_aggregate(
        song,
        1,
        new_score,
    )


def test_rerate_within_same_bucket_updates_shifted_song_aggregates(
    client: TestClient,
    db_session: Session,
):
    """Moving an existing ranking within a bucket adjusts every shifted song."""
    token = _get_token(client)

    result_a = _finalize(client, token, deezer_id=111, bucket="like")
    result_b = _finalize(client, token, deezer_id=222, bucket="like", position=2)
    result_c = _finalize(client, token, deezer_id=333, bucket="like", position=3)
    song_ids = [
        result_a["ranking"]["song_id"],
        result_b["ranking"]["song_id"],
        result_c["ranking"]["song_id"],
    ]

    _finalize(client, token, deezer_id=333, bucket="like", position=1)
    score_by_song_id = _ranking_scores_by_song_id(
        client,
        token,
    )

    db_session.expire_all()
    for song_id in song_ids:
        _assert_aggregate(
            _get_song_by_id(
                db_session,
                song_id,
            ),
            1,
            score_by_song_id[song_id],
        )


def test_rerate_to_different_bucket_updates_all_shifted_song_aggregates(
    client: TestClient,
    db_session: Session,
):
    """Moving an existing ranking across buckets adjusts both buckets without changing count."""
    token = _get_token(client)

    result_a = _finalize(client, token, deezer_id=111, bucket="like")
    result_b = _finalize(client, token, deezer_id=222, bucket="like", position=2)
    result_c = _finalize(client, token, deezer_id=333, bucket="dislike")
    result_d = _finalize(client, token, deezer_id=444, bucket="dislike", position=2)
    song_ids = [
        result_a["ranking"]["song_id"],
        result_b["ranking"]["song_id"],
        result_c["ranking"]["song_id"],
        result_d["ranking"]["song_id"],
    ]

    _finalize(client, token, deezer_id=111, bucket="dislike", position=1)
    score_by_song_id = _ranking_scores_by_song_id(
        client,
        token,
    )

    db_session.expire_all()
    for song_id in song_ids:
        _assert_aggregate(
            _get_song_by_id(
                db_session,
                song_id,
            ),
            1,
            score_by_song_id[song_id],
        )


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

    _assert_aggregate(
        song,
        1,
        score_b,
    )


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

    _assert_aggregate(
        song,
        0,
        None,
    )


def test_remove_rating_recomputes_remaining_bucket_song_aggregates(
    client: TestClient,
    db_session: Session,
):
    """Removing from a multi-song bucket updates aggregates for compacted neighbors."""
    token = _get_token(client)

    result_a = _finalize(client, token, deezer_id=111, bucket="like")
    result_b = _finalize(client, token, deezer_id=222, bucket="like", position=2)
    result_c = _finalize(client, token, deezer_id=333, bucket="like", position=3)
    song_id_a = result_a["ranking"]["song_id"]
    song_id_b = result_b["ranking"]["song_id"]
    song_id_c = result_c["ranking"]["song_id"]

    response = client.delete(
        f"/api/v1/ratings/{song_id_a}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    score_by_song_id = _ranking_scores_by_song_id(
        client,
        token,
    )

    db_session.expire_all()
    removed_song = _get_song_by_id(
        db_session,
        song_id_a,
    )
    remaining_song_b = _get_song_by_id(
        db_session,
        song_id_b,
    )
    remaining_song_c = _get_song_by_id(
        db_session,
        song_id_c,
    )

    _assert_aggregate(
        removed_song,
        0,
        None,
    )
    _assert_aggregate(
        remaining_song_b,
        1,
        score_by_song_id[song_id_b],
    )
    _assert_aggregate(
        remaining_song_c,
        1,
        score_by_song_id[song_id_c],
    )


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

    _assert_aggregate(
        song_a,
        1,
        score_by_song_id[song_id_a],
    )
    _assert_aggregate(
        song_b,
        1,
        score_by_song_id[song_id_b],
    )


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
        _assert_aggregate(
            song_obj,
            1,
            score_by_song_id[song_id],
        )


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
    assert "global_rating_sum" not in song_data
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
    assert "global_rating_sum" not in song_data
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
    assert song.global_rating_sum is not None
    assert abs(song.global_rating_sum - (score_a + score_b)) < 0.001
    assert song.global_rating_count == 2
    assert abs(song.global_avg_score - expected_avg) < 0.001


def test_decrement_song_aggregate_raises_when_count_is_zero(
    client: TestClient,
    db_session: Session,
):
    """decrement_song_aggregate fails loudly instead of hiding corrupt aggregate state."""
    token = _get_token(client)
    result = _finalize(client, token, bucket="like")
    song_id = result["ranking"]["song_id"]

    response = client.delete(
        f"/api/v1/ratings/{song_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    with pytest.raises(RuntimeError, match="rating count 0"):
        decrement_song_aggregate(
            db_session,
            song_id,
            result["ranking"]["score"],
        )

    db_session.rollback()


def test_adjust_song_aggregate_raises_when_count_is_zero(
    client: TestClient,
    db_session: Session,
):
    """adjust_song_aggregate requires existing aggregate state because the ranking row persists."""
    token = _get_token(client)
    result = _finalize(client, token, bucket="like")
    song_id = result["ranking"]["song_id"]

    response = client.delete(
        f"/api/v1/ratings/{song_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    with pytest.raises(RuntimeError, match="rating count 0"):
        adjust_song_aggregate(
            db_session,
            song_id,
            old_score=result["ranking"]["score"],
            new_score=result["ranking"]["score"],
        )

    db_session.rollback()


def test_adjust_song_aggregate_raises_when_sum_is_null(
    client: TestClient,
    db_session: Session,
):
    """adjust_song_aggregate rejects a non-empty aggregate with missing sum state."""
    token = _get_token(client)
    result = _finalize(client, token, bucket="like")
    song = _get_song(db_session)
    song.global_rating_sum = None

    with pytest.raises(RuntimeError, match="null rating sum"):
        adjust_song_aggregate(
            db_session,
            result["ranking"]["song_id"],
            old_score=result["ranking"]["score"],
            new_score=result["ranking"]["score"],
        )

    db_session.rollback()
