# Integration tests for the password-reset flow.
# Run against the real test database (listn_test); the only thing mocked is the
# outbound email, monkeypatched so the test can read the plaintext code that the
# user would receive. BackgroundTasks run synchronously under TestClient, so the
# capture list is populated by the time the request returns.
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.security import email_throttle_hash, verify_password
from src.sqlalchemy_tables.password_reset_request import PasswordResetRequest
from src.sqlalchemy_tables.password_reset_token import PasswordResetToken
from src.sqlalchemy_tables.user import User

REGISTER_PAYLOAD = {
    "email": "user@example.com",
    "password": "password123",
    "birthdate": "2000-01-01",
    "display_name": "Test User",
    "username": "testuser",
}


@pytest.fixture
def captured_codes(monkeypatch) -> list[tuple[str, str]]:
    """
    Capture reset codes that would have been emailed.

    Patches the names as imported into src.services.auth (it does
    `from src.services.email import send_password_reset_code`), so the patch must
    target the auth module's namespace, not the email module's.
    """
    codes: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "src.services.auth.send_password_reset_code",
        lambda to, code: codes.append((to, code)),
    )
    monkeypatch.setattr(
        "src.services.auth.send_password_changed_notice",
        lambda to: None,
    )
    return codes


def _register(client: TestClient, **overrides) -> None:
    """Register the standard test user, applying any field overrides."""
    client.post("/api/v1/auth/register", json={**REGISTER_PAYLOAD, **overrides})


def _forgot(client: TestClient, email: str):
    return client.post("/api/v1/auth/forgot-password", json={"email": email})


def _reset(client: TestClient, email: str, code: str, new_password: str):
    return client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "code": code, "new_password": new_password},
    )


# --- forgot-password: no enumeration -----------------------------------------

def test_forgot_password_generic_for_known_and_unknown(client: TestClient, captured_codes):
    """Known and unknown emails return a byte-identical 200 — no enumeration."""
    _register(client)
    known = _forgot(client, "user@example.com")
    unknown = _forgot(client, "nobody@example.com")

    assert known.status_code == 200
    assert unknown.status_code == 200
    assert known.json() == unknown.json()  # identical body on both paths


def test_forgot_password_creates_token_for_known_email_only(
    client: TestClient, db_session: Session, captured_codes
):
    """A known email mints exactly one token + captures a 6-digit code; unknown mints none."""
    _register(client)

    _forgot(client, "user@example.com")
    assert len(captured_codes) == 1
    to, code = captured_codes[0]
    assert to == "user@example.com"
    assert len(code) == 6 and code.isdigit()

    token_count = db_session.execute(
        select(func.count()).select_from(PasswordResetToken)
    ).scalar_one()
    assert token_count == 1

    _forgot(client, "nobody@example.com")
    # Still only the one token from the known email; the unknown email creates none.
    assert len(captured_codes) == 1
    token_count = db_session.execute(
        select(func.count()).select_from(PasswordResetToken)
    ).scalar_one()
    assert token_count == 1


# --- happy path + single use -------------------------------------------------

def test_reset_password_happy_path_updates_hash_and_allows_login(
    client: TestClient, captured_codes
):
    """A correct code resets the password and the new password logs in."""
    _register(client)
    _forgot(client, "user@example.com")
    _, code = captured_codes[0]

    resp = _reset(client, "user@example.com", code, "newpassword456")
    assert resp.status_code == 204

    # Old password no longer works.
    old = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "password123"},
    )
    assert old.status_code == 401

    # New password works.
    new = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "newpassword456"},
    )
    assert new.status_code == 200


def test_reset_password_code_is_single_use(client: TestClient, captured_codes):
    """A code that succeeded once cannot be reused."""
    _register(client)
    _forgot(client, "user@example.com")
    _, code = captured_codes[0]

    first = _reset(client, "user@example.com", code, "newpassword456")
    assert first.status_code == 204

    second = _reset(client, "user@example.com", code, "anotherpass789")
    assert second.status_code == 400
    assert second.json()["detail"] == "Invalid or expired code."


# --- attempt cap -------------------------------------------------------------

def test_reset_password_wrong_code_increments_and_fifth_consumes(
    client: TestClient, db_session: Session, captured_codes
):
    """Wrong codes increment attempts; the 5th wrong try burns the token."""
    _register(client)
    _forgot(client, "user@example.com")

    for _ in range(settings.reset_code_max_attempts):  # 5 wrong attempts (== IP limit)
        resp = _reset(client, "user@example.com", "000000", "newpassword456")
        assert resp.status_code == 400

    token = db_session.execute(select(PasswordResetToken)).scalar_one()
    assert token.attempts == settings.reset_code_max_attempts
    assert token.consumed_at is not None  # burned after the final wrong attempt


def test_reset_password_correct_code_rejected_after_attempt_cap(
    client: TestClient, db_session: Session, captured_codes
):
    """Once burned by wrong attempts, even the correct code is rejected."""
    _register(client)
    _forgot(client, "user@example.com")
    _, code = captured_codes[0]

    # Burn the token: max_attempts - 1 wrong tries via HTTP, then force-consume
    # the rest in the DB to stay under the per-IP rate limit for the final check.
    for _ in range(settings.reset_code_max_attempts - 1):
        _reset(client, "user@example.com", "000000", "x" * 8)
    token = db_session.execute(select(PasswordResetToken)).scalar_one()
    token.attempts = settings.reset_code_max_attempts
    db_session.commit()

    resp = _reset(client, "user@example.com", code, "newpassword456")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid or expired code."


# --- expiry ------------------------------------------------------------------

def test_reset_password_expired_code_rejected(
    client: TestClient, db_session: Session
):
    """A code whose token has expired is rejected with the generic error."""
    _register(client)
    user = db_session.execute(
        select(User).where(User.email == "user@example.com")
    ).scalar_one()

    # Seed an already-expired token directly.
    from src.core.security import hash_password

    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            hashed_code=hash_password("123456"),
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
    )
    db_session.commit()

    resp = _reset(client, "user@example.com", "123456", "newpassword456")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid or expired code."


# --- session invalidation ----------------------------------------------------

def test_old_jwt_rejected_after_reset(client: TestClient, captured_codes):
    """A JWT issued before a reset returns 401 on /me afterward."""
    _register(client)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "password123"},
    )
    old_token = login.json()["access_token"]

    # Sanity: the token works before the reset.
    before = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert before.status_code == 200

    _forgot(client, "user@example.com")
    _, code = captured_codes[0]
    assert _reset(client, "user@example.com", code, "newpassword456").status_code == 204

    after = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert after.status_code == 401


def test_iat_equal_to_password_changed_at_is_rejected(
    client: TestClient, db_session: Session, captured_codes
):
    """The <= boundary: a token whose iat == password_changed_at (to the second) is rejected,
    while a token issued one second later is accepted."""
    _register(client)
    _forgot(client, "user@example.com")
    _, code = captured_codes[0]
    assert _reset(client, "user@example.com", code, "newpassword456").status_code == 204

    user = db_session.execute(
        select(User).where(User.email == "user@example.com")
    ).scalar_one()
    pct = int(user.password_changed_at.timestamp())
    exp = datetime.now(timezone.utc) + timedelta(days=1)

    def mint(iat: int) -> str:
        return jwt.encode(
            {"sub": str(user.id), "iat": iat, "exp": exp},
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )

    # Equal to the second → rejected (this is why the comparison is <=, not <).
    equal = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {mint(pct)}"})
    assert equal.status_code == 401

    # One second after the reset → a legitimately newer session still works.
    newer = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {mint(pct + 1)}"})
    assert newer.status_code == 200


# --- per-email throttle ------------------------------------------------------

def test_per_email_throttle_caps_emails_within_window(
    client: TestClient, db_session: Session, captured_codes
):
    """Once an email has hit the hourly cap, no further code is sent for it —
    independent of the per-IP limit, and regardless of whether prior requests
    were for a known or unknown address (same email hash)."""
    _register(client)
    email_hash = email_throttle_hash("user@example.com")

    # Seed `cap` prior requests, aged past the cooldown but within the window,
    # so the cooldown does not mask the cap.
    now = datetime.now(timezone.utc)
    for i in range(settings.reset_max_requests_per_window):
        db_session.add(
            PasswordResetRequest(
                email_hash=email_hash,
                created_at=now - timedelta(minutes=2 + i),
            )
        )
    db_session.commit()

    resp = _forgot(client, "user@example.com")
    assert resp.status_code == 200  # still generic
    assert captured_codes == []  # capped → no email sent
    token_count = db_session.execute(
        select(func.count()).select_from(PasswordResetToken)
    ).scalar_one()
    assert token_count == 0  # capped before any token is minted


def test_resend_cooldown_blocks_rapid_second_request(
    client: TestClient, captured_codes
):
    """A second request for the same email within the cooldown sends no new code."""
    _register(client)
    _forgot(client, "user@example.com")
    _forgot(client, "user@example.com")  # immediate retry — within 60s cooldown
    assert len(captured_codes) == 1


# --- IP rate limit -----------------------------------------------------------

def test_forgot_password_ip_rate_limit(client: TestClient, captured_codes):
    """The 6th forgot-password call within a minute trips the per-IP limit."""
    for i in range(5):
        resp = _forgot(client, f"user{i}@example.com")
        assert resp.status_code == 200
    sixth = _forgot(client, "user5@example.com")
    assert sixth.status_code == 429


# --- account deletion with an outstanding token ------------------------------

def test_account_deletion_succeeds_with_outstanding_reset_token(
    client: TestClient, db_session: Session, captured_codes
):
    """Deleting an account must not fail when the user has a live reset token.

    password_reset_tokens.user_id references users.id with no cascade, so the
    account-deletion flow has to remove the user's tokens or the final user delete
    raises a foreign-key IntegrityError.
    """
    reg = client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    token = reg.json()["access_token"]

    _forgot(client, "user@example.com")  # mints a password_reset_tokens row
    assert db_session.execute(
        select(func.count()).select_from(PasswordResetToken)
    ).scalar_one() == 1

    resp = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204
    assert db_session.execute(
        select(func.count()).select_from(PasswordResetToken)
    ).scalar_one() == 0
