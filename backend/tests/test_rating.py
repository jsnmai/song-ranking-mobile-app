# Integration tests for Phase 4 ratings, rankings, and rating_events.
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.services.rating import BUCKET_SCORE_RANGES
from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song


def _register_payload(
    email: str,
    username: str,
) -> dict:
    """Return a valid register payload with caller-provided identity fields."""
    return {
        "email": email,
        "password": "password123",
        "birthdate": "2000-01-01",
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
        json=_register_payload(
            email,
            username,
        ),
    )
    return response.json()["access_token"]


def _rating_payload(
    deezer_id: int = 123,
    title: str = "Nights",
    bucket: str = "like",
    position: int | None = None,
    note: str | None = None,
) -> dict:
    """Return a finalize-rating payload shaped like a user-touched Deezer song."""
    payload = {
        "song": {
            "deezer_id": deezer_id,
            "isrc": "USUG11900842",
            "title": title,
            "artist": "Frank Ocean",
            "artist_deezer_id": 456,
            "album": "Blonde",
            "cover_url": "https://example.com/cover.jpg",
            "preview_url": "https://example.com/preview.mp3",
            "genre_deezer": None,
        },
        "bucket": bucket,
    }
    if position is not None:
        payload["position"] = position
    if note is not None:
        payload["note"] = note
    return payload


def _finalize_rating(
    client: TestClient,
    token: str,
    payload: dict,
) -> dict:
    """Finalize a rating and return the response body."""
    requested_position = payload.get("position")
    if requested_position is not None:
        return _finalize_rating_through_comparison(
            client,
            token,
            payload,
            requested_position,
        )

    response = client.post(
        "/api/v1/ratings/finalize",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def _finalize_rating_through_comparison(
    client: TestClient,
    token: str,
    payload: dict,
    requested_position: int,
) -> dict:
    """Drive the public comparison API until it finalizes the target at the requested position."""
    response = client.post(
        "/api/v1/comparison-sessions",
        json={
            "song": payload["song"],
            "bucket": payload["bucket"],
            "note": payload.get("note"),
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


def _positions_for_bucket(
    db_session: Session,
    bucket: str,
) -> list[int]:
    """Return stored positions for a bucket ordered by position."""
    return list(
        db_session.execute(
            select(Ranking.position)
            .where(Ranking.bucket == bucket)
            .order_by(Ranking.position.asc())
        ).scalars()
    )


def _ranking_rows_for_bucket(
    db_session: Session,
    bucket: str,
) -> list[tuple[int, float]]:
    """Return stored position/score rows for a bucket ordered by position."""
    return list(
        db_session.execute(
            select(
                Ranking.position,
                Ranking.score,
            )
            .where(Ranking.bucket == bucket)
            .order_by(Ranking.position.asc())
        )
    )


def _expected_score(
    bucket: str,
    position: int,
    total: int,
) -> float:
    """Return the current score formula result for test expectations."""
    score_range = BUCKET_SCORE_RANGES[bucket]
    if total <= 1:
        return score_range["midpoint"]

    t_value = (position - 1) / max(
        total - 1,
        1,
    )
    score = score_range["max"] - (score_range["max"] - score_range["min"]) * t_value
    return round(
        max(
            score,
            score_range["min"],
        ),
        4,
    )


def _reorder_rankings(
    client: TestClient,
    token: str,
    rankings: list[dict],
) -> Response:
    """Submit a reorder request and return the raw response."""
    return client.put(
        "/api/v1/rankings/reorder",
        json={"rankings": rankings},
        headers={"Authorization": f"Bearer {token}"},
    )


def test_finalize_rating_requires_auth(client: TestClient):
    """Finalizing without a token returns 401."""
    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(),
    )
    assert response.status_code == 401


def test_remove_rating_requires_auth(client: TestClient):
    """Removing without a token returns 401."""
    response = client.delete("/api/v1/ratings/1")
    assert response.status_code == 401


def test_rankings_requires_auth(client: TestClient):
    """Listing rankings without a token returns 401."""
    response = client.get("/api/v1/rankings/me")
    assert response.status_code == 401


def test_ranking_by_deezer_id_requires_auth(client: TestClient):
    """Looking up a ranking from search without a token returns 401."""
    response = client.get("/api/v1/rankings/me/by-deezer/123")
    assert response.status_code == 401


def test_ranking_by_deezer_id_returns_current_user_ranking(client: TestClient):
    """Search can open Song Detail for a song the current user has already rated."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(
            deezer_id=123,
            title="Nights",
        ),
    )

    response = client.get(
        "/api/v1/rankings/me/by-deezer/123",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["song"]["deezer_id"] == 123
    assert body["song"]["title"] == "Nights"
    assert body["bucket"] == "like"


def test_ranking_by_deezer_id_returns_404_for_unrated_song(client: TestClient):
    """Search can tell the difference between rated and unrated songs."""
    token = _get_token(client)

    response = client.get(
        "/api/v1/rankings/me/by-deezer/999",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


def test_ranking_by_deezer_id_is_scoped_to_current_user(client: TestClient):
    """A user cannot open another user's rating through search-result Deezer IDs."""
    first_token = _get_token(
        client,
        email="first@example.com",
        username="firstuser",
    )
    second_token = _get_token(
        client,
        email="second@example.com",
        username="seconduser",
    )
    _finalize_rating(
        client,
        first_token,
        _rating_payload(deezer_id=123),
    )

    response = client.get(
        "/api/v1/rankings/me/by-deezer/123",
        headers={"Authorization": f"Bearer {second_token}"},
    )

    assert response.status_code == 404


def test_finalize_empty_bucket_creates_ranking_and_event(
    client: TestClient,
    db_session: Session,
):
    """A first song in a bucket gets the midpoint score and one rating event."""
    token = _get_token(client)

    body = _finalize_rating(
        client,
        token,
        _rating_payload(note="first heard this on a walk"),
    )

    assert body["ranking"]["bucket"] == "like"
    assert body["ranking"]["position"] == 1
    assert body["ranking"]["score"] == BUCKET_SCORE_RANGES["like"]["midpoint"]
    assert body["rating_event"]["event_type"] == "rated"
    assert body["rating_event"]["previous_bucket"] is None
    assert body["rating_event"]["new_bucket"] == "like"
    assert body["rating_event"]["new_position"] == 1
    assert body["rating_event"]["new_score"] == BUCKET_SCORE_RANGES["like"]["midpoint"]
    assert body["rating_event"]["note"] == "first heard this on a walk"
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 1
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 1


def test_rating_note_is_trimmed(client: TestClient):
    """Rating notes are stored without leading or trailing whitespace."""
    token = _get_token(client)

    body = _finalize_rating(
        client,
        token,
        _rating_payload(note="   first heard this on a walk   "),
    )

    assert body["rating_event"]["note"] == "first heard this on a walk"


def test_empty_rating_note_normalizes_to_null(client: TestClient):
    """Whitespace-only notes do not create visible empty note content."""
    token = _get_token(client)

    body = _finalize_rating(
        client,
        token,
        _rating_payload(note="   "),
    )

    assert body["rating_event"]["note"] is None


def test_rating_note_does_not_affect_score(client: TestClient):
    """Notes are user-authored text only and do not affect server-calculated score."""
    token = _get_token(client)

    without_note = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=301, title="No Note", note=None),
    )
    with_note = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=302, title="With Note", bucket="alright", note="I have thoughts."),
    )

    assert without_note["ranking"]["score"] == BUCKET_SCORE_RANGES["like"]["midpoint"]
    assert with_note["ranking"]["score"] == BUCKET_SCORE_RANGES["alright"]["midpoint"]


def test_finalize_rating_success_includes_request_id_header(client: TestClient):
    """Successful rating responses include a request correlation ID."""
    token = _get_token(client)

    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    assert response.headers["X-Request-ID"]


def test_finalize_rating_error_includes_request_id_header(client: TestClient):
    """Failed rating responses include a request correlation ID."""
    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(),
    )

    assert response.status_code == 401
    assert response.headers["X-Request-ID"]


def test_finalize_rating_accepts_large_deezer_id(client: TestClient):
    """Real Deezer IDs can exceed PostgreSQL's 32-bit integer range."""
    token = _get_token(client)

    body = _finalize_rating(
        client,
        token,
        _rating_payload(
            deezer_id=3_993_449_551,
            title="Smoke",
        ),
    )

    assert body["ranking"]["song"]["deezer_id"] == 3_993_449_551


def test_finalize_second_song_without_position_requires_comparison(
    client: TestClient,
    db_session: Session,
):
    """A second song needs comparison output to decide above or below the first."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )

    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(deezer_id=456, title="Pink + White"),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Comparison session required for this bucket."
    db_session.expire_all()
    assert _positions_for_bucket(
        db_session,
        "like",
    ) == [1]


def test_public_finalize_with_position_is_rejected(
    client: TestClient,
    db_session: Session,
):
    """The public endpoint never accepts client-supplied positions."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )

    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(deezer_id=456, title="Pink + White", position=2),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Positioned rating finalization requires a completed comparison session."
    db_session.expire_all()
    assert _positions_for_bucket(
        db_session,
        "like",
    ) == [1]


def test_two_song_bucket_score_boundaries(
    client: TestClient,
    db_session: Session,
):
    """Two-song buckets use their current top and bottom score boundaries."""
    token = _get_token(client)
    expected_scores = {
        bucket: {
            1: score_range["max"],
            2: score_range["min"],
        }
        for bucket, score_range in BUCKET_SCORE_RANGES.items()
    }

    for index, bucket in enumerate(expected_scores):
        _finalize_rating(
            client,
            token,
            _rating_payload(
                deezer_id=1_000 + index,
                title=f"{bucket.title()} One",
                bucket=bucket,
            ),
        )
        second_body = _finalize_rating(
            client,
            token,
            _rating_payload(
                deezer_id=2_000 + index,
                title=f"{bucket.title()} Two",
                bucket=bucket,
                position=2,
            ),
        )
        assert second_body["ranking"]["position"] == 2

    rankings_response = client.get(
        "/api/v1/rankings/me?limit=10",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert rankings_response.status_code == 200
    rankings = rankings_response.json()["rankings"]
    for bucket, bucket_scores in expected_scores.items():
        api_scores_by_position = {
            ranking["position"]: ranking["score"]
            for ranking in rankings
            if ranking["bucket"] == bucket
        }
        assert api_scores_by_position == bucket_scores

    db_session.expire_all()
    for bucket, bucket_scores in expected_scores.items():
        assert _ranking_rows_for_bucket(
            db_session,
            bucket,
        ) == list(bucket_scores.items())


def test_finalize_deep_bucket_without_position_requires_comparison(client: TestClient):
    """Buckets with two or more existing songs require Phase 5 comparison output."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=456, title="Pink + White", position=2),
    )

    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(deezer_id=789, title="Self Control"),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Comparison session required for this bucket."


def test_finalize_with_position_recalculates_scores_and_compacts_positions(
    client: TestClient,
    db_session: Session,
):
    """A comparison-determined position inserts cleanly and recalculates the bucket."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=456, title="Pink + White", position=2),
    )

    body = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=789, title="Self Control", position=2),
    )

    assert body["ranking"]["position"] == 2
    assert body["ranking"]["score"] == BUCKET_SCORE_RANGES["like"]["midpoint"]
    db_session.expire_all()
    rows = list(
        db_session.execute(
            select(
                Ranking.position,
                Ranking.score,
            )
            .where(Ranking.bucket == "like")
            .order_by(Ranking.position.asc())
        )
    )
    assert rows == [
        (1, BUCKET_SCORE_RANGES["like"]["max"]),
        (2, BUCKET_SCORE_RANGES["like"]["midpoint"]),
        (3, BUCKET_SCORE_RANGES["like"]["min"]),
    ]


def test_remove_rating_deletes_ranking_compacts_bucket_and_writes_removed_event(
    client: TestClient,
    db_session: Session,
):
    """Removing a rating deletes current state and records append-only history."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    middle = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=456, title="Pink + White", position=2),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=789, title="Self Control", position=2),
    )
    rankings_before_remove_response = client.get(
        "/api/v1/rankings/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    rankings_before_remove = rankings_before_remove_response.json()["rankings"]
    removed_ranking = next(
        ranking
        for ranking in rankings_before_remove
        if ranking["song_id"] == middle["ranking"]["song_id"]
    )

    response = client.delete(
        f"/api/v1/ratings/{middle['ranking']['song_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["rating_event"]["event_type"] == "removed"
    assert body["rating_event"]["previous_bucket"] == removed_ranking["bucket"]
    assert body["rating_event"]["previous_position"] == removed_ranking["position"]
    assert body["rating_event"]["previous_score"] == removed_ranking["score"]
    assert body["rating_event"]["new_bucket"] is None
    assert body["rating_event"]["new_position"] is None
    assert body["rating_event"]["new_score"] is None
    db_session.expire_all()
    assert _positions_for_bucket(
        db_session,
        "like",
    ) == [1, 2]
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 2
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 4


def test_remove_middle_rating_compacts_positions_and_recalculates_scores(
    client: TestClient,
    db_session: Session,
):
    """Removing the middle of three rankings leaves no gaps and recalculates scores."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    middle = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=456, title="Pink + White", position=2),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=789, title="Self Control", position=3),
    )

    response = client.delete(
        f"/api/v1/ratings/{middle['ranking']['song_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    rankings_response = client.get(
        "/api/v1/rankings/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    remaining_like_rankings = [
        ranking
        for ranking in rankings_response.json()["rankings"]
        if ranking["bucket"] == "like"
    ]
    expected_scores = [
        BUCKET_SCORE_RANGES["like"]["max"],
        BUCKET_SCORE_RANGES["like"]["min"],
    ]
    assert [
        ranking["position"]
        for ranking in remaining_like_rankings
    ] == [1, 2]
    assert [
        ranking["score"]
        for ranking in remaining_like_rankings
    ] == expected_scores
    db_session.expire_all()
    assert _ranking_rows_for_bucket(
        db_session,
        "like",
    ) == [
        (1, expected_scores[0]),
        (2, expected_scores[1]),
    ]


def test_remove_rating_cannot_delete_another_users_ranking(
    client: TestClient,
    db_session: Session,
):
    """Deleting by song ID is scoped to current_user.id, preventing IDOR."""
    token_a = _get_token(client)
    token_b = _get_token(
        client,
        email="other@example.com",
        username="otheruser",
    )
    body = _finalize_rating(
        client,
        token_a,
        _rating_payload(deezer_id=123, title="Nights"),
    )

    response = client.delete(
        f"/api/v1/ratings/{body['ranking']['song_id']}",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response.status_code == 404
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 1


def test_other_user_cannot_remove_or_rerate_first_users_ranking(
    client: TestClient,
    db_session: Session,
):
    """Remove and rerate-style writes are scoped to the authenticated user."""
    token_a = _get_token(client)
    token_b = _get_token(
        client,
        email="other@example.com",
        username="otheruser",
    )
    first_user_body = _finalize_rating(
        client,
        token_a,
        _rating_payload(deezer_id=123, title="Nights", bucket="like"),
    )

    remove_response = client.delete(
        f"/api/v1/ratings/{first_user_body['ranking']['song_id']}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    second_user_body = _finalize_rating(
        client,
        token_b,
        _rating_payload(deezer_id=123, title="Nights", bucket="dislike"),
    )

    assert remove_response.status_code == 404
    assert second_user_body["rating_event"]["event_type"] == "rated"
    db_session.expire_all()
    first_user_ranking = db_session.execute(
        select(Ranking)
        .where(Ranking.id == first_user_body["ranking"]["id"])
    ).scalar_one()
    assert first_user_ranking.bucket == "like"
    assert first_user_ranking.score == first_user_body["ranking"]["score"]
    assert db_session.scalar(select(func.count()).select_from(Song)) == 1
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 2
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 2


def test_rankings_list_only_returns_current_users_rankings(client: TestClient):
    """The rankings endpoint never leaks another user's rows."""
    token_a = _get_token(client)
    token_b = _get_token(
        client,
        email="other@example.com",
        username="otheruser",
    )
    _finalize_rating(
        client,
        token_a,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    _finalize_rating(
        client,
        token_b,
        _rating_payload(deezer_id=456, title="Pink + White"),
    )

    response = client.get(
        "/api/v1/rankings/me",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["rankings"]) == 1
    assert body["rankings"][0]["song"]["deezer_id"] == 456


def test_reorder_within_bucket_rewrites_positions_without_events(
    client: TestClient,
    db_session: Session,
):
    """Position-only reorder changes current rankings without writing rating events."""
    token = _get_token(client)
    first = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One"),
    )
    second = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", position=2),
    )
    third = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=333, title="Song Three", position=3),
    )

    response = _reorder_rankings(
        client,
        token,
        [
            {"song_id": second["ranking"]["song_id"], "bucket": "like"},
            {"song_id": first["ranking"]["song_id"], "bucket": "like"},
            {"song_id": third["ranking"]["song_id"], "bucket": "like"},
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["rating_events"] == []
    assert [
        (ranking["song_id"], ranking["position"])
        for ranking in body["rankings"]
    ] == [
        (second["ranking"]["song_id"], 1),
        (first["ranking"]["song_id"], 2),
        (third["ranking"]["song_id"], 3),
    ]
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 3


def test_reorder_crossing_bucket_boundary_writes_reordered_events(
    client: TestClient,
    db_session: Session,
):
    """Dragging songs across bucket boundaries updates buckets and writes metadata events."""
    token = _get_token(client)
    like_one = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One", bucket="like"),
    )
    like_two = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", bucket="like", position=2),
    )
    alright_one = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=333, title="Song Three", bucket="alright"),
    )
    affected_song_ids = [
        alright_one["ranking"]["song_id"],
        like_two["ranking"]["song_id"],
    ]
    comparison_count_before_reorder = db_session.scalar(select(func.count()).select_from(Comparison))

    response = _reorder_rankings(
        client,
        token,
        [
            {"song_id": like_one["ranking"]["song_id"], "bucket": "like"},
            {"song_id": alright_one["ranking"]["song_id"], "bucket": "like"},
            {"song_id": like_two["ranking"]["song_id"], "bucket": "alright"},
        ],
    )

    assert response.status_code == 200
    body = response.json()
    events_by_song_id = {
        event["song_id"]: event
        for event in body["rating_events"]
    }
    assert set(events_by_song_id) == set(affected_song_ids)
    for event in body["rating_events"]:
        assert event["event_type"] == "reordered"
        assert event["event_metadata"] == {
            "session_type": "reorder",
            "songs_affected": 2,
            "affected_song_ids": affected_song_ids,
        }

    promoted_event = events_by_song_id[alright_one["ranking"]["song_id"]]
    assert promoted_event["previous_bucket"] == "alright"
    assert promoted_event["new_bucket"] == "like"
    assert promoted_event["previous_position"] == 1
    assert promoted_event["new_position"] == 2
    assert promoted_event["previous_score"] == _expected_score("alright", 1, 1)
    assert promoted_event["new_score"] == _expected_score("like", 2, 2)

    demoted_event = events_by_song_id[like_two["ranking"]["song_id"]]
    assert demoted_event["previous_bucket"] == "like"
    assert demoted_event["new_bucket"] == "alright"
    assert demoted_event["previous_position"] == 2
    assert demoted_event["new_position"] == 1
    assert demoted_event["previous_score"] == _expected_score("like", 2, 2)
    assert demoted_event["new_score"] == _expected_score("alright", 1, 1)
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(Comparison)) == comparison_count_before_reorder


def test_reorder_cannot_include_another_users_ranking(
    client: TestClient,
    db_session: Session,
):
    """Reorder rejects song IDs that are not ranked by the current user."""
    token_a = _get_token(client)
    token_b = _get_token(
        client,
        email="other@example.com",
        username="otheruser",
    )
    first_user_body = _finalize_rating(
        client,
        token_a,
        _rating_payload(deezer_id=111, title="Song One"),
    )
    second_user_body = _finalize_rating(
        client,
        token_b,
        _rating_payload(deezer_id=222, title="Song Two"),
    )

    response = _reorder_rankings(
        client,
        token_b,
        [
            {"song_id": first_user_body["ranking"]["song_id"], "bucket": "like"},
        ],
    )

    assert response.status_code == 404
    db_session.expire_all()
    second_user_ranking = db_session.execute(
        select(Ranking)
        .where(Ranking.id == second_user_body["ranking"]["id"])
    ).scalar_one()
    assert second_user_ranking.position == 1
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 2


def test_reorder_keeps_positions_contiguous_across_all_buckets(
    client: TestClient,
    db_session: Session,
):
    """Reorder writes clean 1..n positions inside each bucket."""
    token = _get_token(client)
    like_one = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One", bucket="like"),
    )
    like_two = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", bucket="like", position=2),
    )
    alright_one = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=333, title="Song Three", bucket="alright"),
    )
    dislike_one = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=444, title="Song Four", bucket="dislike"),
    )

    response = _reorder_rankings(
        client,
        token,
        [
            {"song_id": alright_one["ranking"]["song_id"], "bucket": "like"},
            {"song_id": like_one["ranking"]["song_id"], "bucket": "alright"},
            {"song_id": like_two["ranking"]["song_id"], "bucket": "alright"},
            {"song_id": dislike_one["ranking"]["song_id"], "bucket": "dislike"},
        ],
    )

    assert response.status_code == 200
    db_session.expire_all()
    assert _positions_for_bucket(
        db_session,
        "like",
    ) == [1]
    assert _positions_for_bucket(
        db_session,
        "alright",
    ) == [1, 2]
    assert _positions_for_bucket(
        db_session,
        "dislike",
    ) == [1]


def test_reorder_recalculates_scores_from_new_positions(
    client: TestClient,
    db_session: Session,
):
    """Reorder recalculates server-owned scores after position changes."""
    token = _get_token(client)
    first = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One"),
    )
    second = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", position=2),
    )
    third = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=333, title="Song Three", position=3),
    )

    response = _reorder_rankings(
        client,
        token,
        [
            {"song_id": third["ranking"]["song_id"], "bucket": "like"},
            {"song_id": second["ranking"]["song_id"], "bucket": "like"},
            {"song_id": first["ranking"]["song_id"], "bucket": "like"},
        ],
    )

    assert response.status_code == 200
    scores_by_song_id = {
        ranking["song_id"]: ranking["score"]
        for ranking in response.json()["rankings"]
    }
    assert scores_by_song_id == {
        third["ranking"]["song_id"]: _expected_score("like", 1, 3),
        second["ranking"]["song_id"]: _expected_score("like", 2, 3),
        first["ranking"]["song_id"]: _expected_score("like", 3, 3),
    }
    db_session.expire_all()
    assert _ranking_rows_for_bucket(
        db_session,
        "like",
    ) == [
        (1, _expected_score("like", 1, 3)),
        (2, _expected_score("like", 2, 3)),
        (3, _expected_score("like", 3, 3)),
    ]


def test_reorder_position_only_moves_do_not_write_rating_events(
    client: TestClient,
    db_session: Session,
):
    """Moving songs inside one bucket updates rankings only."""
    token = _get_token(client)
    first = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One"),
    )
    second = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", position=2),
    )

    response = _reorder_rankings(
        client,
        token,
        [
            {"song_id": second["ranking"]["song_id"], "bucket": "like"},
            {"song_id": first["ranking"]["song_id"], "bucket": "like"},
        ],
    )

    assert response.status_code == 200
    assert response.json()["rating_events"] == []
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 2


def test_reorder_invalid_song_id_fails_safely(
    client: TestClient,
    db_session: Session,
):
    """Reorder rejects unknown song IDs without changing existing rankings."""
    token = _get_token(client)
    body = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One"),
    )

    response = _reorder_rankings(
        client,
        token,
        [
            {"song_id": 999_999, "bucket": "like"},
        ],
    )

    assert response.status_code == 404
    db_session.expire_all()
    ranking = db_session.execute(
        select(Ranking)
        .where(Ranking.id == body["ranking"]["id"])
    ).scalar_one()
    assert ranking.position == 1
    assert ranking.bucket == "like"


def test_reorder_duplicate_song_ids_returns_400(client: TestClient):
    """Reorder rejects duplicate songs before applying any ranking changes."""
    token = _get_token(client)
    first = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One"),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", position=2),
    )

    response = _reorder_rankings(
        client,
        token,
        [
            {"song_id": first["ranking"]["song_id"], "bucket": "like"},
            {"song_id": first["ranking"]["song_id"], "bucket": "like"},
        ],
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Reorder payload contains duplicate songs."


def test_reorder_missing_current_ranking_returns_400(client: TestClient):
    """Reorder payloads must include every current ranking exactly once."""
    token = _get_token(client)
    first = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One"),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", position=2),
    )

    response = _reorder_rankings(
        client,
        token,
        [
            {"song_id": first["ranking"]["song_id"], "bucket": "like"},
        ],
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Reorder payload must include every current ranking."


def test_finalize_same_deezer_song_for_second_user_does_not_modify_first_user(
    client: TestClient,
    db_session: Session,
):
    """The same durable song can have separate user-scoped rankings."""
    token_a = _get_token(client)
    token_b = _get_token(
        client,
        email="other@example.com",
        username="otheruser",
    )
    _finalize_rating(
        client,
        token_a,
        _rating_payload(deezer_id=123, title="Nights", bucket="like"),
    )
    _finalize_rating(
        client,
        token_b,
        _rating_payload(deezer_id=123, title="Nights", bucket="dislike"),
    )

    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 2
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 2


def test_finalize_already_rated_song_writes_rerated_event_and_reuses_song(
    client: TestClient,
    db_session: Session,
):
    """Finalizing an already-rated song updates one ranking and writes rerated history."""
    token = _get_token(client)
    first_body = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights", bucket="like"),
    )

    second_body = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights", bucket="dislike"),
    )

    assert second_body["ranking"]["id"] == first_body["ranking"]["id"]
    assert second_body["ranking"]["bucket"] == "dislike"
    assert second_body["ranking"]["position"] == 1
    assert second_body["rating_event"]["event_type"] == "rerated"
    assert second_body["rating_event"]["previous_bucket"] == first_body["ranking"]["bucket"]
    assert second_body["rating_event"]["previous_position"] == first_body["ranking"]["position"]
    assert second_body["rating_event"]["previous_score"] == first_body["ranking"]["score"]
    assert second_body["rating_event"]["new_bucket"] == second_body["ranking"]["bucket"]
    assert second_body["rating_event"]["new_position"] == second_body["ranking"]["position"]
    assert second_body["rating_event"]["new_score"] == second_body["ranking"]["score"]
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(Song)) == 1
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 1
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 2


def test_finalize_duplicate_rating_keeps_one_song_and_current_ranking(
    client: TestClient,
    db_session: Session,
):
    """Rating the same Deezer track again reuses song/current ranking and appends history."""
    token = _get_token(client)
    first_body = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights", bucket="like"),
    )

    second_body = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights", bucket="dislike"),
    )

    assert second_body["ranking"]["id"] == first_body["ranking"]["id"]
    assert second_body["ranking"]["song_id"] == first_body["ranking"]["song_id"]
    assert second_body["rating_event"]["event_type"] == "rerated"
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(Song)) == 1
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 1
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 2


def test_rating_note_too_long_is_rejected(client: TestClient):
    """Optional rating notes are length-limited before reaching the service."""
    token = _get_token(client)

    response = client.post(
        "/api/v1/ratings/finalize",
        json=_rating_payload(note="a" * 281),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


def test_rankings_cursor_paginates_without_offset(client: TestClient):
    """Rankings list exposes cursor pagination in score order."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights", bucket="like"),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=456, title="Pink + White", bucket="alright"),
    )

    first_response = client.get(
        "/api/v1/rankings/me?limit=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    first_body = first_response.json()
    second_response = client.get(
        f"/api/v1/rankings/me?limit=1&cursor={first_body['next_cursor']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_body["rankings"][0]["song"]["deezer_id"] == 123
    assert second_response.json()["rankings"][0]["song"]["deezer_id"] == 456
