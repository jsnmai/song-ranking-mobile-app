# Integration tests for authentication endpoints.
# Tests run against a real test database (listn_test) with no mocking —
# each test exercises the full stack from HTTP through service to database.
from fastapi.testclient import TestClient

# Shared payload used by tests that need a registered user.
# Defined once so that any change to required fields is updated in one place.
REGISTER_PAYLOAD = {
    "email": "user@example.com",
    "password": "password123",
    "display_name": "Test User",
    "username": "testuser",
}


def test_register_success(client: TestClient):
    """Valid registration payload creates a user + profile atomically, returns 201 with token + user."""
    response = client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "user@example.com"
    assert "id" in body["user"]
    assert "created_at" in body["user"]
    assert "hashed_password" not in body["user"]


def test_register_duplicate_email(client: TestClient):
    """Registering the same email twice returns 409."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    response = client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 409


def test_register_duplicate_username(client: TestClient):
    """Two accounts with the same username return 409 on the second attempt."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    different_email = {**REGISTER_PAYLOAD, "email": "other@example.com"}
    response = client.post("/api/v1/auth/register", json=different_email)
    assert response.status_code == 409


def test_register_invalid_email(client: TestClient):
    """A malformed email is rejected by Pydantic before reaching the service."""
    payload = {**REGISTER_PAYLOAD, "email": "notanemail"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


def test_register_password_too_short(client: TestClient):
    """A password under 8 characters is rejected by Pydantic."""
    payload = {**REGISTER_PAYLOAD, "password": "short"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


def test_register_invalid_username(client: TestClient):
    """A username with invalid characters is rejected by Pydantic."""
    payload = {**REGISTER_PAYLOAD, "username": "bad username!"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


def test_login_success(client: TestClient):
    """Correct credentials return a bearer token."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_wrong_password(client: TestClient):
    """A correct email with the wrong password returns 401."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_login_unknown_email(client: TestClient):
    """An email that was never registered returns 401."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "password123"},
    )
    assert response.status_code == 401


# --- /me ---
# These tests cover the get_current_user dependency, which is used by every
# protected route in the app. If these pass, any route that adds
# Depends(get_current_user) will correctly reject invalid tokens.

def test_me_success(client: TestClient):
    """A valid token returns the authenticated user's profile."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "password123"},
    )
    token = login_response.json()["access_token"]

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "user@example.com"
    assert "hashed_password" not in body


def test_me_no_token(client: TestClient):
    """Calling /me without any token returns 401."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_me_invalid_token(client: TestClient):
    """Calling /me with a garbage token returns 401."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer notavalidtoken"},
    )
    assert response.status_code == 401
