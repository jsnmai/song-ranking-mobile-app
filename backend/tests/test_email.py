# Unit tests for the pluggable email backend dispatch (EMAIL_PROVIDER).
# No network: smtplib.SMTP and httpx.post are stubbed so we assert *which* backend
# send_email routes to, and that missing credentials degrade to console (no crash).
from src.services import email as email_module


class _FakeSMTP:
    """Minimal stand-in for smtplib.SMTP capturing the send without a network call."""

    last: dict = {}

    def __init__(self, host, port, timeout):
        _FakeSMTP.last = {"host": host, "port": port}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        _FakeSMTP.last["starttls"] = True

    def login(self, username, password):
        _FakeSMTP.last["login"] = (username, password)

    def send_message(self, message):
        _FakeSMTP.last["to"] = message["To"]
        _FakeSMTP.last["from"] = message["From"]


def _boom(*args, **kwargs):
    raise AssertionError("this backend must not be called")


def test_smtp_provider_sends_via_smtp(monkeypatch):
    """EMAIL_PROVIDER=smtp with credentials routes to SMTP, not Resend."""
    monkeypatch.setattr(email_module.settings, "email_provider", "smtp")
    monkeypatch.setattr(email_module.settings, "smtp_username", "listnapp@gmail.com")
    monkeypatch.setattr(email_module.settings, "smtp_password", "app-password-xyz")
    monkeypatch.setattr(email_module.settings, "email_from", "LISTn <listnapp@gmail.com>")
    monkeypatch.setattr(email_module.smtplib, "SMTP", _FakeSMTP)
    monkeypatch.setattr(email_module.httpx, "post", _boom)

    email_module.send_email("user@example.com", "Subject", "<p>hi</p>", "hi")

    assert _FakeSMTP.last["to"] == "user@example.com"
    assert _FakeSMTP.last["from"] == "LISTn <listnapp@gmail.com>"
    assert _FakeSMTP.last["login"] == ("listnapp@gmail.com", "app-password-xyz")
    assert _FakeSMTP.last["starttls"] is True


def test_resend_provider_sends_via_resend(monkeypatch):
    """EMAIL_PROVIDER=resend with a key routes to the Resend API, not SMTP."""
    monkeypatch.setattr(email_module.settings, "email_provider", "resend")
    monkeypatch.setattr(email_module.settings, "resend_api_key", "re_test")
    monkeypatch.setattr(email_module.smtplib, "SMTP", _boom)

    calls: dict = {"n": 0}

    class _Resp:
        def raise_for_status(self):
            return None

    def _fake_post(url, headers, json, timeout):
        calls["n"] += 1
        calls["to"] = json["to"]
        return _Resp()

    monkeypatch.setattr(email_module.httpx, "post", _fake_post)

    email_module.send_email("user@example.com", "Subject", "<p>hi</p>", "hi")

    assert calls["n"] == 1
    assert calls["to"] == ["user@example.com"]


def test_console_default_calls_no_external_backend(monkeypatch):
    """The default console provider logs and never touches SMTP or Resend."""
    monkeypatch.setattr(email_module.settings, "email_provider", "console")
    monkeypatch.setattr(email_module.smtplib, "SMTP", _boom)
    monkeypatch.setattr(email_module.httpx, "post", _boom)

    email_module.send_email("user@example.com", "Subject", "<p>hi</p>", "hi")  # must not raise


def test_smtp_without_credentials_falls_back_to_console(monkeypatch):
    """A provider selected without its credentials degrades to console, not a crash."""
    monkeypatch.setattr(email_module.settings, "email_provider", "smtp")
    monkeypatch.setattr(email_module.settings, "smtp_username", None)
    monkeypatch.setattr(email_module.settings, "smtp_password", None)
    monkeypatch.setattr(email_module.smtplib, "SMTP", _boom)
    monkeypatch.setattr(email_module.httpx, "post", _boom)

    email_module.send_email("user@example.com", "Subject", "<p>hi</p>", "hi")  # must not raise
