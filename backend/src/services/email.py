# Transactional email with a pluggable backend selected by EMAIL_PROVIDER:
#   "console" (default) — log the message instead of sending (dev/tests, keyless).
#                         Logs the reset code, so never select this in production.
#   "smtp"              — send via SMTP (e.g. Gmail with an App Password)
#   "resend"            — send via the Resend REST API (over httpx)
# A real provider selected without credentials fails closed (warns, drops the
# message) rather than logging the code — see send_email.
# Helpers are fired from FastAPI BackgroundTasks so the HTTP response returns
# immediately and at constant time (no timing leak on whether mail was sent).
# Sending is best-effort: failures are logged and swallowed so an email outage
# never crashes the request that scheduled it (the user can request another code).
import logging
import smtplib
from email.message import EmailMessage

import httpx

from src.core.config import settings

logger = logging.getLogger("listn.email")

RESEND_API_URL = "https://api.resend.com/emails"
SEND_TIMEOUT_SECONDS = 10.0


def send_email(
    to: str,
    subject: str,
    html: str,
    text: str,
) -> None:
    """
    Send one transactional email through the configured provider.

    Dispatches on settings.email_provider. The "console" backend logs the full
    message (including the reset code) so local dev and tests run with no external
    service — it must never be selected in production. If a REAL provider (smtp /
    resend) is selected but its credentials are missing, the send fails closed with
    a warning and the body is NOT logged: the message text carries a live reset
    code, so logging it would turn a misconfiguration into a credential leak.
    Swapping providers is a one-variable change (EMAIL_PROVIDER=smtp|resend).
    """
    provider = settings.email_provider.lower()

    if provider == "resend" and settings.resend_api_key:
        _send_via_resend(to, subject, html, text)
    elif provider == "smtp" and settings.smtp_username and settings.smtp_password:
        _send_via_smtp(to, subject, html, text)
    elif provider == "console":
        _log_console_email(to, subject, text)
    else:
        # Real provider selected but not fully configured. Fail closed and loud —
        # never log `text` (it contains the plaintext reset code).
        logger.warning(
            "Email NOT sent: provider=%r is selected but missing credentials; "
            "dropped message to %s (%s). Set the provider's credentials.",
            provider,
            to,
            subject,
        )


def _log_console_email(
    to: str,
    subject: str,
    text: str,
) -> None:
    """Dev/test "console" backend: log the message (incl. reset code) instead of sending."""
    logger.info(
        "[console email] to %s: %s\n%s",
        to,
        subject,
        text,
    )


def _send_via_smtp(
    to: str,
    subject: str,
    html: str,
    text: str,
) -> None:
    """
    Send through an SMTP server (e.g. Gmail with an App Password).

    Builds a multipart text+HTML message and authenticates over STARTTLS. Gmail
    rewrites the From to the authenticated account, so email_from should be that
    same address (e.g. "LISTn <your-app@gmail.com>").
    """
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=SEND_TIMEOUT_SECONDS,
        ) as server:
            server.starttls()
            server.login(
                settings.smtp_username,
                settings.smtp_password,
            )
            server.send_message(message)
    except (smtplib.SMTPException, OSError):
        # Best-effort: log and move on. The user can request another code.
        logger.exception("Failed to send email to %s via SMTP (%s)", to, subject)


def _send_via_resend(
    to: str,
    subject: str,
    html: str,
    text: str,
) -> None:
    """Send through the Resend REST API (same httpx pattern as the Deezer client)."""
    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text,
            },
            timeout=SEND_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        # Best-effort: log and move on. The user can request another code.
        logger.exception("Failed to send email to %s via Resend (%s)", to, subject)


def send_password_reset_code(
    to: str,
    code: str,
) -> None:
    """Email a user their one-time password-reset code."""
    subject = "Your LISTn password reset code"
    text = (
        f"Your LISTn password reset code is {code}.\n\n"
        "It expires in 15 minutes and can only be used once. "
        "If you didn't request this, you can safely ignore this email."
    )
    html = (
        f"<p>Your LISTn password reset code is <strong>{code}</strong>.</p>"
        "<p>It expires in 15 minutes and can only be used once. "
        "If you didn't request this, you can safely ignore this email.</p>"
    )
    send_email(to, subject, html, text)


def send_password_changed_notice(
    to: str,
) -> None:
    """Email a user a security notice that their password was just changed."""
    subject = "Your LISTn password was changed"
    text = (
        "Your LISTn password was just changed and you've been signed out on all "
        "other devices.\n\n"
        "If this was you, no action is needed. If you didn't change your "
        "password, reset it again immediately to secure your account."
    )
    html = (
        "<p>Your LISTn password was just changed and you've been signed out on "
        "all other devices.</p>"
        "<p>If this was you, no action is needed. If you didn't change your "
        "password, reset it again immediately to secure your account.</p>"
    )
    send_email(to, subject, html, text)
