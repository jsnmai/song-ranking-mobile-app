"""Tests for reusable social/taste SQL access predicates."""
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.crud.social_access import visible_taste_owner_predicate
from src.sqlalchemy_tables.profile import Profile


def _register(
    client: TestClient,
    email: str,
    username: str,
) -> str:
    """Register one test user and return their token."""
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
    return response.json()["access_token"]


def _follow(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Create one directed follow."""
    response = client.post(
        f"/api/v1/profile/{username}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _set_visibility(
    client: TestClient,
    token: str,
    visibility: str,
) -> None:
    """Set one user's taste visibility."""
    response = client.put(
        "/api/v1/profile/me/visibility",
        json={"visibility": visibility},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _visible_usernames(
    db: Session,
    viewer_username: str,
) -> set[str]:
    """Return usernames accepted by the shared taste visibility predicate."""
    db.expire_all()
    viewer_id = db.execute(
        select(Profile.user_id)
        .where(Profile.username == viewer_username)
    ).scalar_one()
    return set(
        db.execute(
            select(Profile.username)
            .where(
                visible_taste_owner_predicate(
                    viewer_id,
                    Profile.user_id,
                )
            )
        ).scalars()
    )


def test_public_owner_and_current_user_are_visible(
    client: TestClient,
    db_session: Session,
):
    """Public taste and the viewer's own taste pass the shared predicate."""
    _register(client, "viewer@example.com", "viewer")
    _register(client, "public@example.com", "publicuser")

    visible = _visible_usernames(db_session, "viewer")

    assert visible == {"viewer", "publicuser"}


def test_friends_only_requires_mutual_follow(
    client: TestClient,
    db_session: Session,
):
    """One-way follows do not reveal friends-only taste."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    friend_token = _register(client, "friend@example.com", "friend")
    one_way_token = _register(client, "oneway@example.com", "oneway")
    _set_visibility(client, friend_token, "friends_only")
    _set_visibility(client, one_way_token, "friends_only")
    _follow(client, viewer_token, "friend")
    _follow(client, friend_token, "viewer")
    _follow(client, viewer_token, "oneway")

    visible = _visible_usernames(db_session, "viewer")

    assert "friend" in visible
    assert "oneway" not in visible


def test_only_me_and_blocked_public_owner_are_hidden(
    client: TestClient,
    db_session: Session,
):
    """Only-me and blocked owners never leak through a social predicate."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    only_me_token = _register(client, "private@example.com", "privateuser")
    _register(client, "blocked@example.com", "blocked")
    _set_visibility(client, only_me_token, "only_me")
    response = client.post(
        "/api/v1/profile/blocked/block",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert response.status_code == 200

    visible = _visible_usernames(db_session, "viewer")

    assert "privateuser" not in visible
    assert "blocked" not in visible


def test_deleted_owner_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """Deleted users cannot satisfy the shared social access predicate."""
    _register(client, "viewer@example.com", "viewer")
    deleted_token = _register(client, "deleted@example.com", "deleted")
    response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {deleted_token}"},
    )
    assert response.status_code == 204

    visible = _visible_usernames(db_session, "viewer")

    assert "deleted" not in visible
