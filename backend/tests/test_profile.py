# Integration tests for the profile endpoint.
# Tests run against a real test database (listn_test) with no mocking —
# each test exercises the full stack from HTTP through service to database.
from fastapi.testclient import TestClient

REGISTER_PAYLOAD = {
    "email": "user@example.com",
    "password": "password123",
    "birthdate": "2000-01-01",
    "display_name": "Test User",
    "username": "testuser",
}


def _get_token(client: TestClient, payload: dict = REGISTER_PAYLOAD) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post("/api/v1/auth/register", json=payload)
    return response.json()["access_token"]


# --- Auth required ---

def test_profile_setup_no_token(client: TestClient):
    """POST /profile/setup without a token returns 401."""
    response = client.post(
        "/api/v1/profile/setup",
        json={"display_name": "Test User", "username": "testuser"},
    )
    assert response.status_code == 401


def test_profile_setup_invalid_token(client: TestClient):
    """POST /profile/setup with a garbage token returns 401."""
    response = client.post(
        "/api/v1/profile/setup",
        json={"display_name": "Test User", "username": "testuser"},
        headers={"Authorization": "Bearer notavalidtoken"},
    )
    assert response.status_code == 401


# --- Duplicate username ---

def test_profile_setup_duplicate_username(client: TestClient):
    """Trying to claim a username already owned by another user returns 409."""
    # Register user A — gets username "testuser"
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    # Register user B with a different username, then try to claim "testuser"
    user_b_payload = {**REGISTER_PAYLOAD, "email": "other@example.com", "username": "otheruser"}
    user_b_token = _get_token(client, user_b_payload)
    response = client.post(
        "/api/v1/profile/setup",
        json={"display_name": "Test User", "username": "testuser"},
        headers={"Authorization": f"Bearer {user_b_token}"},
    )
    assert response.status_code == 409


# --- Validation ---

def test_profile_setup_username_too_short(client: TestClient):
    """A username under 3 characters is rejected by Pydantic."""
    token = _get_token(client)
    response = client.post(
        "/api/v1/profile/setup",
        json={"display_name": "Test User", "username": "ab"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


def test_profile_setup_username_too_long(client: TestClient):
    """A username over 20 characters is rejected by Pydantic."""
    token = _get_token(client)
    response = client.post(
        "/api/v1/profile/setup",
        json={"display_name": "Test User", "username": "a" * 21},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


def test_profile_setup_username_invalid_chars(client: TestClient):
    """A username containing spaces or special characters is rejected by Pydantic."""
    token = _get_token(client)
    response = client.post(
        "/api/v1/profile/setup",
        json={"display_name": "Test User", "username": "bad user!"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


def test_profile_setup_display_name_empty(client: TestClient):
    """An empty display name is rejected by Pydantic."""
    token = _get_token(client)
    response = client.post(
        "/api/v1/profile/setup",
        json={"display_name": "", "username": "testuser"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


def test_profile_setup_display_name_too_long(client: TestClient):
    """A display name over 30 characters is rejected by Pydantic."""
    token = _get_token(client)
    response = client.post(
        "/api/v1/profile/setup",
        json={"display_name": "a" * 31, "username": "testuser"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422
