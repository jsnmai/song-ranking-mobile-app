"""Tests for the circle access predicate (mutual follows whose taste is visible).

"Your circle" means mutual follows whose taste is visible to the viewer. These
tests pin the differences from the one-way followed_visible_taste_owner_predicate:
a circle member must follow the viewer back, and only_me/blocked/deleted/self are
never circle members.
"""
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.crud.social_access import circle_visible_taste_owner_predicate
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


def _block(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Create one directed block."""
    response = client.post(
        f"/api/v1/profile/{username}/block",
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


def _circle_usernames(
    db: Session,
    viewer_username: str,
) -> set[str]:
    """Return usernames accepted by the circle access predicate for the viewer."""
    db.expire_all()
    viewer_id = db.execute(
        select(Profile.user_id)
        .where(Profile.username == viewer_username)
    ).scalar_one()
    return set(
        db.execute(
            select(Profile.username)
            .where(
                circle_visible_taste_owner_predicate(
                    viewer_id,
                    Profile.user_id,
                )
            )
        ).scalars()
    )


def test_mutual_follow_public_taste_is_in_circle(
    client: TestClient,
    db_session: Session,
):
    """A mutual follow with public taste is a circle member."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    public_token = _register(client, "public@example.com", "publicuser")
    _follow(client, viewer_token, "publicuser")
    _follow(client, public_token, "viewer")

    assert "publicuser" in _circle_usernames(db_session, "viewer")


def test_mutual_follow_friends_only_taste_is_in_circle(
    client: TestClient,
    db_session: Session,
):
    """A mutual follow with friends_only taste is a circle member."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    friend_token = _register(client, "friend@example.com", "friend")
    _set_visibility(client, friend_token, "friends_only")
    _follow(client, viewer_token, "friend")
    _follow(client, friend_token, "viewer")

    assert "friend" in _circle_usernames(db_session, "viewer")


def test_one_way_follow_public_taste_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """A one-way follow of a public user is NOT a circle member (mutual required)."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _register(client, "public@example.com", "publicuser")
    _follow(client, viewer_token, "publicuser")

    assert "publicuser" not in _circle_usernames(db_session, "viewer")


def test_only_me_mutual_follow_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """An only_me user is excluded even when the follow is mutual."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    private_token = _register(client, "private@example.com", "privateuser")
    _set_visibility(client, private_token, "only_me")
    _follow(client, viewer_token, "privateuser")
    _follow(client, private_token, "viewer")

    assert "privateuser" not in _circle_usernames(db_session, "viewer")


def test_viewer_blocked_owner_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """A mutual follow the viewer has blocked is excluded."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    owner_token = _register(client, "owner@example.com", "owneruser")
    _follow(client, viewer_token, "owneruser")
    _follow(client, owner_token, "viewer")
    _block(client, viewer_token, "owneruser")

    assert "owneruser" not in _circle_usernames(db_session, "viewer")


def test_owner_blocked_viewer_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """A mutual follow who has blocked the viewer is excluded."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    owner_token = _register(client, "owner@example.com", "owneruser")
    _follow(client, viewer_token, "owneruser")
    _follow(client, owner_token, "viewer")
    _block(client, owner_token, "viewer")

    assert "owneruser" not in _circle_usernames(db_session, "viewer")


def test_deleted_owner_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """A deleted mutual follow is excluded from the circle."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    deleted_token = _register(client, "deleted@example.com", "deleted")
    _follow(client, viewer_token, "deleted")
    _follow(client, deleted_token, "viewer")
    response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {deleted_token}"},
    )
    assert response.status_code == 204

    assert "deleted" not in _circle_usernames(db_session, "viewer")


def test_self_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """The viewer is never a member of their own circle."""
    _register(client, "viewer@example.com", "viewer")

    assert "viewer" not in _circle_usernames(db_session, "viewer")
