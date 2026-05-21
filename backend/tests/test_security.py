# Security edge case tests.
# Covers token tampering, password boundary values, injection attempts, and rate limiting.
import base64
import json
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from jose import jwt

from src.core.config import settings
from src.core.security import create_access_token

REGISTER_PAYLOAD = {
    "email": "user@example.com",
    "password": "password123",
    "display_name": "Test User",
    "username": "testuser",
}


def _get_token(client: TestClient, payload: dict = REGISTER_PAYLOAD) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post("/api/v1/auth/register", json=payload)
    return response.json()["access_token"]


# --- Token tampering ---

def test_tampered_token_rejected(client: TestClient):
    """Modifying the JWT payload without re-signing returns 401."""
    token = _get_token(client)
    header, payload, signature = token.split(".")
    # Decode the payload, swap the user id, re-encode — but keep the original signature
    payload_data = json.loads(base64.urlsafe_b64decode(payload + "=="))
    payload_data["sub"] = "99999"
    tampered_payload = base64.urlsafe_b64encode(
        json.dumps(payload_data).encode()
    ).decode().rstrip("=")
    tampered_token = f"{header}.{tampered_payload}.{signature}"
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {tampered_token}"},
    )
    assert response.status_code == 401


def test_bearer_prefix_required(client: TestClient):
    """Sending the token without the 'Bearer ' prefix is rejected."""
    token = _get_token(client)
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": token},
    )
    assert response.status_code == 401


def test_wrong_secret_token_rejected(client: TestClient):
    """A structurally valid JWT signed with the wrong secret is rejected."""
    # Valid JWT format, valid base64, but the signature does not match the app's JWT_SECRET_KEY
    forged = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
        ".eyJzdWIiOiIxIn0"
        ".wrongsignatureXXXXXXXXXXXXXXXXXXXXXXX"
    )
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {forged}"},
    )
    assert response.status_code == 401


def test_expired_token_rejected(client: TestClient):
    """An otherwise valid token with an expired exp claim returns 401."""
    token = jwt.encode(
        {
            "sub": "1",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_signed_token_for_nonexistent_user_rejected(client: TestClient):
    """A validly signed token for a deleted or nonexistent user returns 401."""
    token = create_access_token({"sub": "999999"})

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_token_missing_sub_rejected(client: TestClient):
    """A signed token without a user id subject returns 401."""
    token = create_access_token({})

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_token_with_non_integer_sub_rejected(client: TestClient):
    """A signed token with a non-integer subject returns 401."""
    token = create_access_token({"sub": "not-an-int"})

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


# --- Password boundary values ---

def test_password_7_chars_rejected(client: TestClient):
    """A password of 7 characters (one below the 8-character minimum) is rejected."""
    payload = {**REGISTER_PAYLOAD, "password": "short7c"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


def test_password_8_chars_accepted(client: TestClient):
    """A password of exactly 8 characters (the minimum) is accepted."""
    payload = {**REGISTER_PAYLOAD, "password": "exactly8"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201


def test_password_72_chars_accepted(client: TestClient):
    """A password of exactly 72 characters (the bcrypt maximum) is accepted."""
    payload = {**REGISTER_PAYLOAD, "password": "a" * 72}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201


def test_password_73_chars_rejected(client: TestClient):
    """A password of 73 characters (one over the bcrypt silent truncation limit) is rejected."""
    payload = {**REGISTER_PAYLOAD, "password": "a" * 73}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


# --- Username boundary values ---

def test_username_2_chars_rejected(client: TestClient):
    """A username of 2 characters (one below the 3-character minimum) is rejected."""
    payload = {**REGISTER_PAYLOAD, "username": "ab"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


def test_username_3_chars_accepted(client: TestClient):
    """A username of exactly 3 characters (the minimum) is accepted."""
    payload = {**REGISTER_PAYLOAD, "username": "abc"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201


def test_username_20_chars_accepted(client: TestClient):
    """A username of exactly 20 characters (the maximum) is accepted."""
    payload = {**REGISTER_PAYLOAD, "username": "a" * 20}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201


def test_username_21_chars_rejected(client: TestClient):
    """A username of 21 characters (one over the 20-character maximum) is rejected."""
    payload = {**REGISTER_PAYLOAD, "username": "a" * 21}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


# --- Injection attempts ---

def test_sql_injection_in_email_rejected(client: TestClient):
    """SQL injection in the email field is caught by Pydantic's EmailStr validator."""
    payload = {**REGISTER_PAYLOAD, "email": "' OR '1'='1"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


def test_sql_injection_in_username_rejected(client: TestClient):
    """SQL injection in the username field is caught by the regex validator."""
    payload = {**REGISTER_PAYLOAD, "username": "'; DROP TABLE users;--"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


def test_null_byte_in_username_rejected(client: TestClient):
    """A null byte in the username is caught by the regex validator."""
    payload = {**REGISTER_PAYLOAD, "username": "user\x00name"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


def test_xss_in_display_name_stored_as_plain_text(client: TestClient):
    """XSS payloads in display_name are stored verbatim — the API never renders HTML.

    display_name allows any characters. Storage is safe because the backend returns
    raw JSON; escaping is the frontend's responsibility at render time.
    """
    payload = {**REGISTER_PAYLOAD, "display_name": "<script>alert('xss')</script>"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201


# --- Rate limiting ---

def test_login_rate_limit_enforced(client: TestClient):
    """The login endpoint returns 429 after 5 requests per minute."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    credentials = {"email": "user@example.com", "password": "password123"}
    responses = [client.post("/api/v1/auth/login", json=credentials) for _ in range(6)]
    assert responses[-1].status_code == 429


def test_register_rate_limit_enforced(client: TestClient):
    """The register endpoint returns 429 after 5 requests per minute."""
    responses = []
    for i in range(6):
        payload = {**REGISTER_PAYLOAD, "email": f"user{i}@example.com", "username": f"user{i}aaa"}
        responses.append(client.post("/api/v1/auth/register", json=payload))
    assert responses[-1].status_code == 429


def test_finalize_rating_rate_limit_enforced(client: TestClient):
    """The rating finalize endpoint returns 429 after 30 requests per minute."""
    token = _get_token(client)
    payload = {
        "song": {
            "deezer_id": 123,
            "isrc": "USUG11900842",
            "title": "Nights",
            "artist": "Frank Ocean",
            "artist_deezer_id": 456,
            "album": "Blonde",
            "cover_url": "https://example.com/cover.jpg",
            "preview_url": "https://example.com/preview.mp3",
            "genre_deezer": None,
        },
        "bucket": "like",
    }

    responses = [
        client.post(
            "/api/v1/ratings/finalize",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        for _ in range(31)
    ]

    assert responses[-1].status_code == 429
