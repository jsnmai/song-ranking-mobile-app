"""Integration tests for Phase 5 comparison sessions."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.comparison_session import ComparisonSession
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


def _song_payload(
    deezer_id: int,
    title: str,
) -> dict:
    """Return Deezer metadata for a rating/comparison request."""
    return {
        "deezer_id": deezer_id,
        "isrc": "USUG11900842",
        "title": title,
        "artist": "Frank Ocean",
        "artist_deezer_id": 456,
        "album": "Blonde",
        "cover_url": "https://example.com/cover.jpg",
        "preview_url": "https://example.com/preview.mp3",
        "genre_deezer": None,
    }


def _rating_payload(
    deezer_id: int = 123,
    title: str = "Nights",
    bucket: str = "like",
    position: int | None = None,
) -> dict:
    """Return a finalize-rating payload."""
    payload = {
        "song": _song_payload(
            deezer_id,
            title,
        ),
        "bucket": bucket,
    }
    if position is not None:
        payload["position"] = position
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
    session = _start_session(
        client,
        token,
        deezer_id=payload["song"]["deezer_id"],
        title=payload["song"]["title"],
        bucket=payload["bucket"],
    )

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


def _start_session(
    client: TestClient,
    token: str,
    deezer_id: int = 456,
    title: str = "Pink + White",
    bucket: str = "like",
) -> dict:
    """Start a comparison session and return the response body."""
    response = client.post(
        "/api/v1/comparison-sessions",
        json={
            "song": _song_payload(
                deezer_id,
                title,
            ),
            "bucket": bucket,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def test_start_comparison_session_requires_auth(client: TestClient):
    """Starting a comparison session without auth returns 401."""
    response = client.post(
        "/api/v1/comparison-sessions",
        json={
            "song": _song_payload(
                456,
                "Pink + White",
            ),
            "bucket": "like",
        },
    )
    assert response.status_code == 401


def test_start_comparison_session_empty_bucket_rejected(client: TestClient):
    """Empty buckets should use direct rating finalize, not comparison sessions."""
    token = _get_token(client)

    response = client.post(
        "/api/v1/comparison-sessions",
        json={
            "song": _song_payload(
                456,
                "Pink + White",
            ),
            "bucket": "like",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Comparison session is not required for an empty bucket."


def test_start_comparison_session_creates_temporary_state_only(
    client: TestClient,
    db_session: Session,
):
    """Starting a session does not persist the target song or rating history."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )

    body = _start_session(client, token)

    assert body["status"] == "active"
    assert body["candidate"]["song"]["deezer_id"] == 123
    assert body["target_song"]["deezer_id"] == 456
    assert body["low_index"] == 0
    assert body["high_index"] == 1
    assert body["candidate_index"] == 0
    assert body["total_in_bucket"] == 1
    assert body["current_bucket_rankings"] == [
        {
            "song_id": body["candidate"]["song_id"],
            "title": "Nights",
        }
    ]
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(ComparisonSession)) == 1
    assert db_session.scalar(select(func.count()).select_from(Song)) == 1
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 1
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 1
    assert db_session.scalar(select(func.count()).select_from(Comparison)) == 0


def test_comparison_choice_and_finalize_target_wins(
    client: TestClient,
    db_session: Session,
):
    """A target win over one candidate finalizes into position 1 and one comparison row."""
    token = _get_token(client)
    existing = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    session = _start_session(client, token)

    choice_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={
            "winner": "target",
            "decision_duration_ms": 1834,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert choice_response.status_code == 200
    choice_body = choice_response.json()
    assert choice_body["status"] == "ready_to_finalize"
    assert choice_body["final_position"] == 1

    finalize_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert finalize_response.status_code == 200
    body = finalize_response.json()
    assert body["result"]["ranking"]["position"] == 1
    assert body["result"]["ranking"]["score"] == 10.0
    assert body["result"]["rating_event"]["event_type"] == "rated"
    db_session.expire_all()
    comparison = db_session.execute(select(Comparison)).scalar_one()
    assert comparison.song_a_id == existing["ranking"]["song_id"]
    assert comparison.song_b_id == body["result"]["ranking"]["song_id"]
    assert comparison.winner_id == body["result"]["ranking"]["song_id"]
    assert comparison.decision_duration_ms == 1834
    assert comparison.finalized_at is not None
    assert db_session.scalar(select(func.count()).select_from(ComparisonSession)) == 0
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 2
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 2


def test_comparison_choice_candidate_wins_places_target_below(client: TestClient):
    """A candidate win over one candidate finalizes into position 2."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    session = _start_session(client, token)
    choice_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={"winner": "candidate"},
        headers={"Authorization": f"Bearer {token}"},
    )
    choice_body = choice_response.json()

    finalize_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert choice_response.status_code == 200
    assert choice_body["final_position"] == 2
    assert finalize_response.status_code == 200
    assert finalize_response.json()["result"]["ranking"]["position"] == 2


def test_cancel_comparison_session_deletes_only_temporary_state(
    client: TestClient,
    db_session: Session,
):
    """Canceling a session creates no target song, ranking, event, or comparison rows."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    session = _start_session(client, token)
    choice_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={"winner": "target"},
        headers={"Authorization": f"Bearer {token}"},
    )

    response = client.delete(
        f"/api/v1/comparison-sessions/{session['session_uuid']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert choice_response.status_code == 200
    assert response.status_code == 200
    assert response.json()["canceled"] is True
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(ComparisonSession)) == 0
    assert db_session.scalar(select(func.count()).select_from(Song)) == 1
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 1
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 1
    assert db_session.scalar(select(func.count()).select_from(Comparison)) == 0


def test_stale_comparison_session_access_returns_gone(
    client: TestClient,
    db_session: Session,
):
    """Accessing a session after the 24-hour TTL deletes it and returns 410."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    session = _start_session(client, token)
    stale_session = db_session.execute(
        select(ComparisonSession)
        .where(ComparisonSession.session_uuid == session["session_uuid"])
    ).scalar_one()
    stale_session.updated_at = datetime.now(timezone.utc) - timedelta(hours=25)
    db_session.commit()

    response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={"winner": "target"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 410
    assert response.json()["detail"] == "Comparison session expired."
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(ComparisonSession)) == 0
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 1
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 1
    assert db_session.scalar(select(func.count()).select_from(Comparison)) == 0


def test_start_comparison_session_deletes_expired_sessions(
    client: TestClient,
    db_session: Session,
):
    """Starting a new session opportunistically deletes abandoned active sessions."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    stale = _start_session(
        client,
        token,
        deezer_id=456,
        title="Pink + White",
    )
    stale_session = db_session.execute(
        select(ComparisonSession)
        .where(ComparisonSession.session_uuid == stale["session_uuid"])
    ).scalar_one()
    stale_session.updated_at = datetime.now(timezone.utc) - timedelta(hours=25)
    db_session.commit()

    fresh = _start_session(
        client,
        token,
        deezer_id=789,
        title="Self Control",
    )

    db_session.expire_all()
    sessions = list(db_session.execute(select(ComparisonSession)).scalars())
    assert len(sessions) == 1
    assert str(sessions[0].session_uuid) == fresh["session_uuid"]
    assert fresh["session_uuid"] != stale["session_uuid"]


def test_other_user_cannot_access_comparison_session(
    client: TestClient,
    db_session: Session,
):
    """Session choice/finalize/cancel endpoints are scoped to current_user.id."""
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
    session = _start_session(client, token_a)

    choice_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={"winner": "target"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    finalize_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    cancel_response = client.delete(
        f"/api/v1/comparison-sessions/{session['session_uuid']}",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert choice_response.status_code == 404
    assert finalize_response.status_code == 404
    assert cancel_response.status_code == 404
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(ComparisonSession)) == 1


def test_other_user_cannot_finalize_comparison_session(
    client: TestClient,
    db_session: Session,
):
    """Finalizing another user's active session is denied without changing data."""
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
    session = _start_session(client, token_a)

    response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response.status_code == 404
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(ComparisonSession)) == 1
    assert db_session.scalar(select(func.count()).select_from(Comparison)) == 0


def test_other_user_cannot_choose_for_comparison_session(
    client: TestClient,
    db_session: Session,
):
    """Submitting a choice for another user's session is denied."""
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
    session = _start_session(client, token_a)

    response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={"winner": "target"},
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response.status_code == 404
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(ComparisonSession)) == 1
    assert db_session.scalar(select(func.count()).select_from(Comparison)) == 0


def test_finalize_before_session_ready_is_rejected(client: TestClient):
    """A session must complete binary insertion before finalize."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    session = _start_session(client, token)

    response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Comparison session is not ready to finalize."


def test_finalize_already_deleted_session_fails_safely(
    client: TestClient,
    db_session: Session,
):
    """Finalizing a session twice returns 404 after the first finalize deletes it."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    session = _start_session(client, token)
    choice_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={"winner": "target"},
        headers={"Authorization": f"Bearer {token}"},
    )
    first_finalize = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token}"},
    )

    second_finalize = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert choice_response.status_code == 200
    assert first_finalize.status_code == 200
    assert second_finalize.status_code == 404
    assert second_finalize.json()["detail"] == "Comparison session not found."
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(ComparisonSession)) == 0
    assert db_session.scalar(select(func.count()).select_from(Comparison)) == 1


def test_comparison_choice_rejects_arbitrary_winner_value(client: TestClient):
    """Winner input must be one of the two server-defined choices."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    session = _start_session(client, token)

    response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={"winner": "999999"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


def test_comparison_choice_rejects_negative_decision_duration(client: TestClient):
    """Decision duration must be a non-negative number of milliseconds."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    session = _start_session(client, token)

    response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={
            "winner": "target",
            "decision_duration_ms": -1,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


def test_comparison_choice_accepts_large_decision_duration(client: TestClient):
    """Large durations are accepted; analytics should filter absurd values downstream."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )
    session = _start_session(client, token)

    response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={
            "winner": "target",
            "decision_duration_ms": 28800000,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200


def test_binary_insertion_can_span_multiple_comparisons(client: TestClient):
    """A three-song bucket can require two comparisons before final position is known."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One"),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", position=2),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=333, title="Song Three", position=3),
    )
    session = _start_session(
        client,
        token,
        deezer_id=444,
        title="Song Four",
    )

    first_choice = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={"winner": "target"},
        headers={"Authorization": f"Bearer {token}"},
    )
    second_choice = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
        json={"winner": "candidate"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert first_choice.status_code == 200
    assert first_choice.json()["status"] == "active"
    assert first_choice.json()["comparison_count"] == 1
    assert first_choice.json()["low_index"] == 0
    assert first_choice.json()["high_index"] == 1
    assert first_choice.json()["candidate_index"] == 0
    assert first_choice.json()["total_in_bucket"] == 3
    assert [
        item["title"]
        for item in first_choice.json()["current_bucket_rankings"]
    ] == [
        "Song One",
        "Song Two",
        "Song Three",
    ]
    assert second_choice.status_code == 200
    assert second_choice.json()["status"] == "ready_to_finalize"
    assert second_choice.json()["final_position"] == 2


def test_binary_insertion_all_win_path_lands_first(
    client: TestClient,
    db_session: Session,
):
    """A target that beats every candidate lands at the top of the bucket."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One"),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", position=2),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=333, title="Song Three", position=3),
    )
    comparison_count_before_session = db_session.scalar(select(func.count()).select_from(Comparison))
    session = _start_session(
        client,
        token,
        deezer_id=444,
        title="Song Four",
    )

    while session["status"] == "active":
        choice_response = client.post(
            f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
            json={"winner": "target"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert choice_response.status_code == 200
        session = choice_response.json()

    finalize_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert session["final_position"] == 1
    assert finalize_response.status_code == 200
    assert finalize_response.json()["result"]["ranking"]["position"] == 1
    db_session.expire_all()
    comparison_count_after_session = db_session.scalar(select(func.count()).select_from(Comparison))
    assert comparison_count_after_session == comparison_count_before_session + 2


def test_binary_insertion_all_lose_path_lands_last(client: TestClient):
    """A target that loses to every candidate lands below the whole bucket."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=111, title="Song One"),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=222, title="Song Two", position=2),
    )
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=333, title="Song Three", position=3),
    )
    session = _start_session(
        client,
        token,
        deezer_id=444,
        title="Song Four",
    )

    while session["status"] == "active":
        choice_response = client.post(
            f"/api/v1/comparison-sessions/{session['session_uuid']}/choices",
            json={"winner": "candidate"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert choice_response.status_code == 200
        session = choice_response.json()

    finalize_response = client.post(
        f"/api/v1/comparison-sessions/{session['session_uuid']}/finalize",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert session["final_position"] == 4
    assert finalize_response.status_code == 200
    assert finalize_response.json()["result"]["ranking"]["position"] == 4
