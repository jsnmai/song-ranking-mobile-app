# Tests for the signal-capture slice: POST /events, comparison tombstones,
# rating decision context, and profile timezone capture.
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.interaction_event import InteractionEvent
from src.sqlalchemy_tables.rating_event import RatingEvent


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
            "birthdate": "2000-01-01",
            "display_name": "Test User",
            "username": username,
        },
    )
    data = response.json()
    return data["access_token"], data["user"]["id"]


def _song_payload(deezer_id: int, title: str = "Test Song") -> dict:
    """Build one finalize-compatible song payload."""
    return {
        "deezer_id": deezer_id,
        "isrc": None,
        "title": title,
        "artist": "Test Artist",
        "artist_deezer_id": 1,
        "album": "Test Album",
        "cover_url": "https://example.com/cover.jpg",
        "preview_url": None,
        "genre_deezer": None,
    }


def _rate(
    client: TestClient,
    token: str,
    deezer_id: int,
    bucket: str = "like",
    extra: dict | None = None,
) -> None:
    """Finalize one rating into an empty bucket."""
    body = {
        "song": _song_payload(deezer_id),
        "bucket": bucket,
    }
    if extra:
        body.update(extra)
    response = client.post(
        "/api/v1/ratings/finalize",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201


def test_preview_event_is_recorded(
    client: TestClient,
    db_session: Session,
) -> None:
    """A whitelisted client event lands in interaction_events with its context."""
    token, user_id = _register(client, "events@example.com", "eventsuser")

    response = client.post(
        "/api/v1/events",
        json={
            "event_type": "preview_completed",
            "deezer_id": 999,
            "source": "discover",
            "listened_ms": 28000,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    assert response.json() == {"recorded": True}
    event = db_session.execute(
        select(InteractionEvent).where(InteractionEvent.user_id == user_id)
    ).scalar_one()
    assert event.event_type == "preview_completed"
    assert event.source == "discover"
    # Song 999 was never persisted, so song_id resolves to null but the deezer_id is kept.
    assert event.song_id is None
    assert event.context["deezer_id"] == 999
    assert event.context["listened_ms"] == 28000


def test_server_only_event_types_are_rejected(client: TestClient) -> None:
    """Clients cannot spoof tombstone event types through the endpoint."""
    token, _ = _register(client, "spoof@example.com", "spoofuser")

    response = client.post(
        "/api/v1/events",
        json={"event_type": "comparison_canceled"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


def test_canceled_comparison_session_is_tombstoned(
    client: TestClient,
    db_session: Session,
) -> None:
    """Canceling a session writes a hesitation tombstone before deleting state."""
    token, user_id = _register(client, "cancel@example.com", "canceluser")
    _rate(client, token, 700)

    start = client.post(
        "/api/v1/comparison-sessions",
        json={
            "song": _song_payload(701, title="Second Song"),
            "bucket": "like",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert start.status_code == 201
    session_uuid = start.json()["session_uuid"]

    cancel = client.delete(
        f"/api/v1/comparison-sessions/{session_uuid}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert cancel.status_code == 200

    event = db_session.execute(
        select(InteractionEvent).where(
            InteractionEvent.user_id == user_id,
            InteractionEvent.event_type == "comparison_canceled",
        )
    ).scalar_one()
    assert event.context["bucket"] == "like"
    assert event.context["deezer_id"] == 701
    assert event.context["decisions_count"] == 0
    assert event.context["elapsed_ms"] >= 0


def test_finalize_stores_decision_context(
    client: TestClient,
    db_session: Session,
) -> None:
    """discovery_source and deliberation land in rating_events.event_metadata."""
    token, user_id = _register(client, "context@example.com", "contextuser")
    _rate(
        client,
        token,
        800,
        extra={
            "discovery_source": "cosign",
            "rating_started_at": "2026-06-10T00:00:00Z",
        },
    )

    event = db_session.execute(
        select(RatingEvent).where(RatingEvent.user_id == user_id)
    ).scalar_one()
    assert event.event_metadata["discovery_source"] == "cosign"
    # Clock-skew clamp: deliberation is bounded to 0..24h regardless of client time.
    assert 0 <= event.event_metadata["deliberation_ms"] <= 24 * 60 * 60 * 1000


def test_finalize_without_context_stores_no_metadata(
    client: TestClient,
    db_session: Session,
) -> None:
    """Plain ratings keep event_metadata null — no empty-dict noise."""
    token, user_id = _register(client, "plain@example.com", "plainuser")
    _rate(client, token, 900)

    event = db_session.execute(
        select(RatingEvent).where(RatingEvent.user_id == user_id)
    ).scalar_one()
    assert event.event_metadata is None


def test_profile_timezone_capture_and_validation(client: TestClient) -> None:
    """PATCH /profile/me accepts a real IANA timezone and rejects junk."""
    token, _ = _register(client, "tz@example.com", "tzuser")

    ok = client.patch(
        "/api/v1/profile/me",
        json={"timezone": "America/Los_Angeles"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ok.status_code == 200
    assert ok.json()["timezone"] == "America/Los_Angeles"

    bad = client.patch(
        "/api/v1/profile/me",
        json={"timezone": "Not/AZone"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert bad.status_code == 422
