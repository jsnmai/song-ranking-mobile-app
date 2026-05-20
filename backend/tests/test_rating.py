# Integration tests for Phase 4 ratings, rankings, and rating_events.
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

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
    response = client.post(
        "/api/v1/ratings/finalize",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


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
    assert body["ranking"]["score"] == 8.75
    assert body["rating_event"]["event_type"] == "rated"
    assert body["rating_event"]["previous_bucket"] is None
    assert body["rating_event"]["new_bucket"] == "like"
    assert body["rating_event"]["new_position"] == 1
    assert body["rating_event"]["new_score"] == 8.75
    assert body["rating_event"]["note"] == "first heard this on a walk"
    assert db_session.scalar(select(func.count()).select_from(Ranking)) == 1
    assert db_session.scalar(select(func.count()).select_from(RatingEvent)) == 1


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


def test_finalize_second_song_with_position_recalculates_two_song_bucket(
    client: TestClient,
    db_session: Session,
):
    """Phase 5 comparison output can place the second song in a non-empty bucket."""
    token = _get_token(client)
    _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=123, title="Nights"),
    )

    body = _finalize_rating(
        client,
        token,
        _rating_payload(deezer_id=456, title="Pink + White", position=2),
    )

    assert body["ranking"]["position"] == 2
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
        (1, 10.0),
        (2, 7.5),
    ]


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
    assert body["ranking"]["score"] == 8.75
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
        (1, 10.0),
        (2, 8.75),
        (3, 7.5),
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
