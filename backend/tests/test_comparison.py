"""Integration tests for Phase 5 comparison sessions."""
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
    response = client.post(
        "/api/v1/ratings/finalize",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


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
        json={"winner": "target"},
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
    assert second_choice.status_code == 200
    assert second_choice.json()["status"] == "ready_to_finalize"
    assert second_choice.json()["final_position"] == 2
