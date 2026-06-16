# Integration tests for PATCH /profile/me — editing display name, username, and avatar color.
from fastapi.testclient import TestClient


def _register(client: TestClient, email: str, username: str) -> str:
    """Register a user and return their JWT."""
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


def _patch(client: TestClient, token: str, body: dict):
    return client.patch(
        "/api/v1/profile/me",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
    )


def test_edit_requires_auth(client: TestClient):
    """PATCH /profile/me without a token returns 401."""
    response = client.patch("/api/v1/profile/me", json={"display_name": "Nope"})
    assert response.status_code == 401


def test_edit_avatar_color_defaults_to_null(client: TestClient):
    """A freshly registered user has no avatar_color until they pick one."""
    token = _register(client, "a@example.com", "aaa")
    me = client.get("/api/v1/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["avatar_color"] is None


def test_edit_display_name_only(client: TestClient):
    """Editing display_name updates it without touching the username."""
    token = _register(client, "b@example.com", "bbb")
    response = _patch(client, token, {"display_name": "  New Name  "})
    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "New Name"  # trimmed
    assert body["username"] == "bbb"
    assert body["avatar_color"] is None


def test_edit_username_lowercased_and_persisted(client: TestClient):
    """Editing the username stores it lowercased and is reflected on the next read."""
    token = _register(client, "c@example.com", "ccc")
    response = _patch(client, token, {"username": "NewHandle"})
    assert response.status_code == 200
    assert response.json()["username"] == "newhandle"

    me = client.get("/api/v1/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["username"] == "newhandle"


def test_edit_avatar_color(client: TestClient):
    """A valid palette token is saved and returned."""
    token = _register(client, "d@example.com", "ddd")
    response = _patch(client, token, {"avatar_color": "mint"})
    assert response.status_code == 200
    assert response.json()["avatar_color"] == "mint"


def test_edit_rejects_unknown_color(client: TestClient):
    """A color outside the fixed palette is rejected with 422."""
    token = _register(client, "e@example.com", "eee")
    response = _patch(client, token, {"avatar_color": "chartreuse"})
    assert response.status_code == 422


def test_edit_rejects_invalid_username_chars(client: TestClient):
    """Usernames with illegal characters are rejected with 422."""
    token = _register(client, "f@example.com", "fff")
    response = _patch(client, token, {"username": "bad name!"})
    assert response.status_code == 422


def test_edit_username_conflict_returns_409(client: TestClient):
    """Taking another user's username returns 409 and does not change the profile."""
    _register(client, "taken@example.com", "taken")
    token = _register(client, "g@example.com", "ggg")
    response = _patch(client, token, {"username": "taken"})
    assert response.status_code == 409

    me = client.get("/api/v1/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["username"] == "ggg"  # unchanged


def test_edit_username_to_own_current_is_noop(client: TestClient):
    """Submitting the user's own current username is allowed (no false conflict)."""
    token = _register(client, "h@example.com", "hhh")
    response = _patch(client, token, {"username": "hhh", "avatar_color": "sky"})
    assert response.status_code == 200
    assert response.json()["username"] == "hhh"
    assert response.json()["avatar_color"] == "sky"


def test_edit_all_fields_together(client: TestClient):
    """display_name, username, and avatar_color can be changed in one request."""
    token = _register(client, "i@example.com", "iii")
    response = _patch(client, token, {
        "display_name": "Iris",
        "username": "iris_listens",
        "avatar_color": "plum",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "Iris"
    assert body["username"] == "iris_listens"
    assert body["avatar_color"] == "plum"


def test_edit_empty_body_keeps_profile_unchanged(client: TestClient):
    """An empty patch leaves every field as it was."""
    token = _register(client, "j@example.com", "jjj")
    response = _patch(client, token, {})
    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "Jjj"
    assert body["username"] == "jjj"
    assert body["avatar_color"] is None
