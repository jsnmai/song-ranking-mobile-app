# Tests for breached-password screening (Have I Been Pwned, k-anonymity) and its
# enforcement at register + reset. No network: httpx.get is stubbed with canned data.
import hashlib

import httpx

from src.services import pwned_passwords


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text

    def raise_for_status(self) -> None:
        return None


def _sha1_parts(password: str) -> tuple[str, str]:
    digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    return digest[:5], digest[5:]


BREACHED_PASSWORD_MESSAGE = "This password has appeared in a known data breach. Please choose a different password."


# --- k-anonymity range lookup ------------------------------------------------

def test_pwned_count_returns_breach_count_and_sends_only_the_prefix(monkeypatch):
    prefix, suffix = _sha1_parts("correct horse battery staple")
    digest = prefix + suffix
    captured: dict = {}

    def fake_get(url, headers=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["timeout"] = timeout
        # A real match line, plus decoy lines the parser must skip.
        body = f"0000000000000000000000000000000000A:1\n{suffix}:4242\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0"
        return _FakeResponse(body)

    monkeypatch.setattr(pwned_passwords.httpx, "get", fake_get)

    assert pwned_passwords.pwned_count("correct horse battery staple") == 4242
    # k-anonymity: only the 5-char prefix goes over the wire, never the suffix.
    assert captured["url"].endswith(prefix)
    assert suffix not in captured["url"]
    assert digest not in captured["url"]
    assert "correct horse battery staple" not in captured["url"]
    assert captured["headers"]["Add-Padding"] == "true"
    assert captured["headers"]["User-Agent"] == pwned_passwords.USER_AGENT
    assert captured["timeout"] == pwned_passwords.HIBP_TIMEOUT_SECONDS


def test_pwned_count_is_zero_when_the_suffix_is_absent(monkeypatch):
    monkeypatch.setattr(
        pwned_passwords.httpx,
        "get",
        lambda *a, **k: _FakeResponse("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:9"),
    )
    assert pwned_passwords.pwned_count("a-very-unique-passphrase") == 0


def test_pwned_count_is_none_on_network_error(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("HIBP down")

    monkeypatch.setattr(pwned_passwords.httpx, "get", boom)
    assert pwned_passwords.pwned_count("whatever") is None


# --- is_password_pwned decision ----------------------------------------------

def test_is_password_pwned_true_over_threshold(monkeypatch):
    monkeypatch.setattr(pwned_passwords, "pwned_count", lambda password: 10)
    monkeypatch.setattr(pwned_passwords.settings, "pwned_password_check_enabled", True)
    monkeypatch.setattr(pwned_passwords.settings, "pwned_password_threshold", 0)
    assert pwned_passwords.is_password_pwned("p") is True


def test_is_password_pwned_false_when_not_found(monkeypatch):
    monkeypatch.setattr(pwned_passwords, "pwned_count", lambda password: 0)
    monkeypatch.setattr(pwned_passwords.settings, "pwned_password_check_enabled", True)
    assert pwned_passwords.is_password_pwned("p") is False


def test_is_password_pwned_fails_open_when_check_unavailable(monkeypatch):
    monkeypatch.setattr(pwned_passwords, "pwned_count", lambda password: None)
    monkeypatch.setattr(pwned_passwords.settings, "pwned_password_check_enabled", True)
    assert pwned_passwords.is_password_pwned("p") is False


def test_is_password_pwned_skipped_when_disabled(monkeypatch):
    def must_not_call(password):
        raise AssertionError("pwned_count must not run when the check is disabled")

    monkeypatch.setattr(pwned_passwords, "pwned_count", must_not_call)
    monkeypatch.setattr(pwned_passwords.settings, "pwned_password_check_enabled", False)
    assert pwned_passwords.is_password_pwned("p") is False


# --- enforcement at register + reset -----------------------------------------

def _register(client, email="pwn@example.com", username="pwnuser"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": "Pwn Test",
            "username": username,
        },
    )


def test_register_rejects_a_breached_password(client, monkeypatch):
    monkeypatch.setattr("src.services.auth.is_password_pwned", lambda password: True)

    resp = _register(client, email="breach@example.com", username="breachuser")

    assert resp.status_code == 400
    assert resp.json()["detail"] == BREACHED_PASSWORD_MESSAGE


def test_reset_rejects_a_breached_new_password_without_consuming_the_code(client, monkeypatch):
    codes: list[str] = []
    monkeypatch.setattr("src.services.auth.send_password_reset_code", lambda to, code: codes.append(code))
    monkeypatch.setattr("src.services.auth.send_no_account_notice", lambda to: None)
    monkeypatch.setattr("src.services.auth.send_password_changed_notice", lambda to: None)

    _register(client, email="pwn@example.com", username="pwnuser")
    client.post("/api/v1/auth/forgot-password", json={"email": "pwn@example.com"})
    code = codes[0]

    # A breached new password is rejected, and the code is NOT consumed.
    monkeypatch.setattr("src.services.auth.is_password_pwned", lambda password: True)
    breached = client.post(
        "/api/v1/auth/reset-password",
        json={"email": "pwn@example.com", "code": code, "new_password": "password123"},
    )
    assert breached.status_code == 400
    assert breached.json()["detail"] == BREACHED_PASSWORD_MESSAGE

    # The same code still works with a clean password; the token survived.
    monkeypatch.setattr("src.services.auth.is_password_pwned", lambda password: False)
    clean = client.post(
        "/api/v1/auth/reset-password",
        json={"email": "pwn@example.com", "code": code, "new_password": "a-fresh-unbreached-pw"},
    )
    assert clean.status_code == 204
