# Integration tests for private user/profile reports.
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.report import Report


def _register(
    client: TestClient,
    email: str,
    username: str,
) -> tuple[str, int]:
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


def _set_visibility(
    client: TestClient,
    token: str,
    visibility: str,
) -> None:
    response = client.put(
        "/api/v1/profile/me/visibility",
        json={"visibility": visibility},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _follow(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    response = client.post(
        f"/api/v1/profile/{username}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _finalize_rating(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str,
    note: str | None = None,
) -> dict:
    payload = {
        "song": {
            "deezer_id": deezer_id,
            "isrc": "USUM70000000",
            "title": title,
            "artist": "Frank Ocean",
            "artist_deezer_id": 456,
            "album": "Blonde",
            "cover_url": "https://example.com/cover.jpg",
            "preview_url": "https://example.com/preview.mp3",
            "genre_deezer": None,
        },
        "bucket": "like",
    }
    if note is not None:
        payload["note"] = note
    response = client.post(
        "/api/v1/ratings/finalize",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def test_authenticated_user_can_report_another_profile(
    client: TestClient,
    db_session: Session,
) -> None:
    """Profile reports persist as private safety records with open status."""
    reporter_token, reporter_id = _register(client, "reporter@example.com", "reporter")
    _, reported_id = _register(client, "reported@example.com", "reported")

    response = client.post(
        "/api/v1/profile/reported/report",
        json={
            "target_type": "profile",
            "reason": "harassment",
            "details": "Repeated hostile profile behavior.",
        },
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["reporter_user_id"] == reporter_id
    assert body["reported_user_id"] == reported_id
    assert body["target_type"] == "profile"
    assert body["target_id"] is None
    assert body["reason"] == "harassment"
    assert body["details"] == "Repeated hostile profile behavior."
    assert body["status"] == "open"

    report = db_session.execute(select(Report)).scalar_one()
    assert report.reporter_user_id == reporter_id
    assert report.reported_user_id == reported_id
    assert report.reason == "harassment"
    assert report.target_id is None
    assert report.details == "Repeated hostile profile behavior."
    assert report.status == "open"
    assert report.reviewed_at is None
    assert report.reviewed_by is None


def test_report_accepts_under_13_reason_and_blank_details(
    client: TestClient,
    db_session: Session,
) -> None:
    """The under_13 report reason is accepted and blank details store as null."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    _register(client, "reported@example.com", "reported")

    response = client.post(
        "/api/v1/profile/reported/report",
        json={
            "target_type": "user",
            "reason": "under_13",
            "details": "   ",
        },
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["target_type"] == "user"
    assert body["reason"] == "under_13"
    assert body["details"] is None
    report = db_session.execute(select(Report)).scalar_one()
    assert report.details is None


def test_user_cannot_report_self(client: TestClient) -> None:
    """Self-reports are rejected server-side."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")

    response = client.post(
        "/api/v1/profile/reporter/report",
        json={"reason": "other"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "You cannot report yourself."


def test_duplicate_reports_are_allowed_for_mvp(
    client: TestClient,
    db_session: Session,
) -> None:
    """MVP stores repeat reports instead of deduping them."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    _register(client, "reported@example.com", "reported")

    for _ in range(2):
        response = client.post(
            "/api/v1/profile/reported/report",
            json={"reason": "spam"},
            headers={"Authorization": f"Bearer {reporter_token}"},
        )
        assert response.status_code == 201

    assert db_session.execute(select(func.count()).select_from(Report)).scalar_one() == 2


def test_profile_report_rate_limit_prevents_extra_reports(
    client: TestClient,
    db_session: Session,
) -> None:
    """Report user/profile is throttled while still allowing MVP duplicates inside the limit."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    _register(client, "reported@example.com", "reported")

    for _ in range(5):
        response = client.post(
            "/api/v1/profile/reported/report",
            json={"reason": "spam"},
            headers={"Authorization": f"Bearer {reporter_token}"},
        )
        assert response.status_code == 201

    limited_response = client.post(
        "/api/v1/profile/reported/report",
        json={"reason": "spam"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert limited_response.status_code == 429
    assert db_session.execute(select(func.count()).select_from(Report)).scalar_one() == 5


def test_reports_are_not_publicly_listable(client: TestClient) -> None:
    """Regular users have no endpoint for listing all private safety reports."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")

    response = client.get(
        "/api/v1/reports",
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert response.status_code == 404


def test_report_response_is_not_exposed_to_reported_user(
    client: TestClient,
) -> None:
    """Reported users are not notified or given report data through profile responses."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    reported_token, _ = _register(client, "reported@example.com", "reported")
    response = client.post(
        "/api/v1/profile/reported/report",
        json={"reason": "impersonation"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )
    assert response.status_code == 201

    profile_response = client.get(
        "/api/v1/profile/me",
        headers={"Authorization": f"Bearer {reported_token}"},
    )

    assert profile_response.status_code == 200
    assert "reports" not in profile_response.json()


def test_private_profile_shell_can_be_reported_without_taste_leak(
    client: TestClient,
) -> None:
    """Only-me hides taste, but the visible shell report flow returns only report data."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    reported_token, _ = _register(client, "reported@example.com", "reported")
    _set_visibility(client, reported_token, "only_me")

    response = client.post(
        "/api/v1/profile/reported/report",
        json={"reason": "other"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["reason"] == "other"
    assert "visibility" not in body
    assert "can_view_taste" not in body


def test_blocked_profile_report_uses_normal_profile_access(
    client: TestClient,
    db_session: Session,
) -> None:
    """Blocked profiles return the same 404 as normal profile opening."""
    blocker_token, _ = _register(client, "blocker@example.com", "blocker")
    blocked_token, _ = _register(client, "blocked@example.com", "blocked")
    block_response = client.post(
        "/api/v1/profile/blocked/block",
        headers={"Authorization": f"Bearer {blocker_token}"},
    )
    assert block_response.status_code == 200

    response = client.post(
        "/api/v1/profile/blocker/report",
        json={"reason": "other"},
        headers={"Authorization": f"Bearer {blocked_token}"},
    )

    assert response.status_code == 404
    assert db_session.execute(select(func.count()).select_from(Report)).scalar_one() == 0


def test_authenticated_user_can_report_visible_rating_note(
    client: TestClient,
    db_session: Session,
) -> None:
    """Visible rating notes can be reported as private safety records."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    owner_token, owner_id = _register(client, "owner@example.com", "owner")
    result = _finalize_rating(client, owner_token, 3001, "Noted Song", note="This one stuck.")
    event_id = result["rating_event"]["id"]

    response = client.post(
        f"/api/v1/rating-events/{event_id}/report",
        json={
            "target_type": "rating_note",
            "reason": "inappropriate_content",
            "details": "This note needs review.",
        },
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["reported_user_id"] == owner_id
    assert body["target_type"] == "rating_note"
    assert body["target_id"] == event_id
    assert body["status"] == "open"

    report = db_session.execute(select(Report)).scalar_one()
    assert report.reported_user_id == owner_id
    assert report.target_type == "rating_note"
    assert report.target_id == event_id


def test_authenticated_user_can_report_visible_rating_event_without_note(
    client: TestClient,
    db_session: Session,
) -> None:
    """Visible rating events can be reported even when no note exists."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    owner_token, _ = _register(client, "owner@example.com", "owner")
    result = _finalize_rating(client, owner_token, 3002, "Rating Only Song")
    event_id = result["rating_event"]["id"]

    response = client.post(
        f"/api/v1/rating-events/{event_id}/report",
        json={"target_type": "rating_event", "reason": "spam"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert response.status_code == 201
    report = db_session.execute(select(Report)).scalar_one()
    assert report.target_type == "rating_event"
    assert report.target_id == event_id


def test_rating_note_report_requires_note(
    client: TestClient,
    db_session: Session,
) -> None:
    """A rating_note report cannot be created for an event with no note."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    owner_token, _ = _register(client, "owner@example.com", "owner")
    result = _finalize_rating(client, owner_token, 3003, "No Note Song")
    event_id = result["rating_event"]["id"]

    response = client.post(
        f"/api/v1/rating-events/{event_id}/report",
        json={"target_type": "rating_note", "reason": "other"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert response.status_code == 404
    assert db_session.execute(select(func.count()).select_from(Report)).scalar_one() == 0


def test_user_cannot_report_own_rating_event(client: TestClient) -> None:
    """Self-reports for rating events are rejected server-side."""
    owner_token, _ = _register(client, "owner@example.com", "owner")
    result = _finalize_rating(client, owner_token, 3004, "Own Song", note="Mine.")
    event_id = result["rating_event"]["id"]

    response = client.post(
        f"/api/v1/rating-events/{event_id}/report",
        json={"target_type": "rating_note", "reason": "other"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "You cannot report your own rating."


def test_inaccessible_rating_note_cannot_be_reported(
    client: TestClient,
    db_session: Session,
) -> None:
    """Private or blocked rating notes are not reportable by unauthorized viewers."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    owner_token, _ = _register(client, "owner@example.com", "owner")
    result = _finalize_rating(client, owner_token, 3005, "Private Note Song", note="Hidden note.")
    event_id = result["rating_event"]["id"]
    _set_visibility(client, owner_token, "only_me")

    private_response = client.post(
        f"/api/v1/rating-events/{event_id}/report",
        json={"target_type": "rating_note", "reason": "other"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )
    assert private_response.status_code == 404

    _set_visibility(client, owner_token, "public")
    block_response = client.post(
        "/api/v1/profile/reporter/block",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert block_response.status_code == 200

    blocked_response = client.post(
        f"/api/v1/rating-events/{event_id}/report",
        json={"target_type": "rating_note", "reason": "other"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert blocked_response.status_code == 404
    assert db_session.execute(select(func.count()).select_from(Report)).scalar_one() == 0


def test_friends_only_rating_note_can_be_reported_by_mutual_friend(client: TestClient) -> None:
    """Friends-only notes are reportable only to mutual follows."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    owner_token, _ = _register(client, "owner@example.com", "owner")
    result = _finalize_rating(client, owner_token, 3006, "Friend Note Song", note="Friend-visible note.")
    event_id = result["rating_event"]["id"]
    _set_visibility(client, owner_token, "friends_only")

    not_friend_response = client.post(
        f"/api/v1/rating-events/{event_id}/report",
        json={"target_type": "rating_note", "reason": "other"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )
    assert not_friend_response.status_code == 404

    _follow(client, reporter_token, "owner")
    _follow(client, owner_token, "reporter")
    friend_response = client.post(
        f"/api/v1/rating-events/{event_id}/report",
        json={"target_type": "rating_note", "reason": "other"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert friend_response.status_code == 201


def test_rating_event_report_rate_limit_prevents_extra_reports(
    client: TestClient,
    db_session: Session,
) -> None:
    """Report rating/note is throttled and does not create rows above the limit."""
    reporter_token, _ = _register(client, "reporter@example.com", "reporter")
    owner_token, _ = _register(client, "owner@example.com", "owner")
    result = _finalize_rating(client, owner_token, 3007, "Rate Limited Note", note="Please review.")
    event_id = result["rating_event"]["id"]

    for _ in range(5):
        response = client.post(
            f"/api/v1/rating-events/{event_id}/report",
            json={"target_type": "rating_note", "reason": "spam"},
            headers={"Authorization": f"Bearer {reporter_token}"},
        )
        assert response.status_code == 201

    limited_response = client.post(
        f"/api/v1/rating-events/{event_id}/report",
        json={"target_type": "rating_note", "reason": "spam"},
        headers={"Authorization": f"Bearer {reporter_token}"},
    )

    assert limited_response.status_code == 429
    assert db_session.execute(select(func.count()).select_from(Report)).scalar_one() == 5
