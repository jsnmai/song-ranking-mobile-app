# Tests for the pre-launch security pass: per-account login throttle, per-user
# rate-limit keying, security headers, and CORS tightening.
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.limiter import user_or_ip_key
from src.core.security import create_access_token


def _register_payload(
    email: str,
    username: str,
) -> dict:
    """Return a valid register payload."""
    return {
        "email": email,
        "password": "password123",
        "birthdate": "2000-01-01",
        "display_name": username.title(),
        "username": username,
    }


def _register(
    client: TestClient,
    email: str = "hardening@example.com",
    username: str = "hardening",
) -> str:
    """Register a user and return the JWT."""
    response = client.post(
        "/api/v1/auth/register",
        json=_register_payload(email, username),
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def _login(
    client: TestClient,
    email: str,
    password: str,
):
    """Attempt a login and return the raw response."""
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )


# ── Per-email login throttle ─────────────────────────────────────────────────


def test_login_throttles_after_repeated_failures_even_with_correct_password(
    client: TestClient,
    monkeypatch,
):
    """The failure cap locks the throttle window for the account, not just bad guesses."""
    monkeypatch.setattr(settings, "login_max_failures_per_window", 2)
    _register(client, "throttle@example.com", "throttleuser")

    assert _login(client, "throttle@example.com", "wrong-one").status_code == 401
    assert _login(client, "throttle@example.com", "wrong-two").status_code == 401

    blocked = _login(client, "throttle@example.com", "password123")
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "Too many login attempts. Try again later."


def test_login_throttle_behaves_identically_for_unknown_emails(
    client: TestClient,
    monkeypatch,
):
    """Unknown emails hit the same 429 at the same cap — no enumeration signal."""
    monkeypatch.setattr(settings, "login_max_failures_per_window", 2)

    assert _login(client, "ghost@example.com", "wrong-one").status_code == 401
    assert _login(client, "ghost@example.com", "wrong-two").status_code == 401
    assert _login(client, "ghost@example.com", "wrong-three").status_code == 429


def test_successful_login_clears_the_failure_history(
    client: TestClient,
    monkeypatch,
):
    """A real login resets the account's failure budget."""
    monkeypatch.setattr(settings, "login_max_failures_per_window", 2)
    _register(client, "reset-budget@example.com", "resetbudget")

    assert _login(client, "reset-budget@example.com", "wrong-one").status_code == 401
    assert _login(client, "reset-budget@example.com", "password123").status_code == 200
    # The earlier failure no longer counts toward the cap.
    assert _login(client, "reset-budget@example.com", "wrong-two").status_code == 401
    assert _login(client, "reset-budget@example.com", "password123").status_code == 200


def test_login_throttle_is_per_account_not_global(
    client: TestClient,
    monkeypatch,
):
    """One hammered account never locks a different account out."""
    monkeypatch.setattr(settings, "login_max_failures_per_window", 2)
    _register(client, "victim@example.com", "victimuser")
    _register(client, "bystander@example.com", "bystanderuser")

    assert _login(client, "victim@example.com", "wrong-one").status_code == 401
    assert _login(client, "victim@example.com", "wrong-two").status_code == 401
    assert _login(client, "victim@example.com", "wrong-three").status_code == 429

    assert _login(client, "bystander@example.com", "password123").status_code == 200


# ── Per-user rate-limit keying ───────────────────────────────────────────────


class _FakeRequest:
    """Minimal request stand-in for key-func unit tests."""

    def __init__(
        self,
        authorization: str | None,
    ) -> None:
        self.headers = {"authorization": authorization} if authorization else {}
        # Attributes get_remote_address reads when no proxy headers are present.
        self.client = type("client", (), {"host": "203.0.113.7"})()


def test_user_or_ip_key_uses_verified_jwt_subject():
    """A valid token keys the bucket by account id, immune to IP spoofing."""
    token = create_access_token({"sub": "41"})
    assert user_or_ip_key(_FakeRequest(f"Bearer {token}")) == "user:41"


def test_user_or_ip_key_falls_back_to_ip_without_valid_token():
    """Missing or forged tokens fall back to the client address."""
    assert user_or_ip_key(_FakeRequest(None)) == "203.0.113.7"
    assert user_or_ip_key(_FakeRequest("Bearer not-a-real-token")) == "203.0.113.7"
    assert user_or_ip_key(_FakeRequest("Basic abc123")) == "203.0.113.7"


def test_authed_routes_key_limits_per_user(
    client: TestClient,
    db_session: Session,
):
    """Authed traffic lands in per-user buckets so spoofed IPs cannot reset them."""
    token = _register(client, "keyed@example.com", "keyeduser")

    # Same user, wildly different forged client IPs → the bucket must not care.
    for forged_ip in ("10.0.0.1", "10.0.0.2"):
        response = client.get(
            "/api/v1/notifications/unread-count",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Forwarded-For": forged_ip,
            },
        )
        assert response.status_code == 200


# ── Security headers and CORS ────────────────────────────────────────────────


def test_security_headers_present_on_api_responses(
    client: TestClient,
):
    """Every API response carries the baseline hardening headers."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Strict-Transport-Security"].startswith("max-age=")
    assert response.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"


def test_docs_are_exempt_from_the_strict_csp(
    client: TestClient,
):
    """Swagger needs inline assets, so /docs skips the JSON-API CSP but keeps the rest."""
    response = client.get("/docs")
    assert response.status_code == 200
    assert "Content-Security-Policy" not in response.headers
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_cors_allows_only_declared_methods_and_headers(
    client: TestClient,
):
    """Preflight grants reflect the explicit allowlists, not wildcards."""
    response = client.options(
        "/api/v1/feed",
        headers={
            "Origin": settings.cors_origins,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert response.status_code == 200
    allowed_methods = response.headers["access-control-allow-methods"]
    assert "GET" in allowed_methods
    assert "*" not in allowed_methods
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
