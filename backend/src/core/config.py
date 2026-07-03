# Centralised settings

# JWT
# The algorithm used to sign JWTs is "HS256" which is HMAC + SHA-256.
# HS256 = "use HMAC with SHA-256 as the underlying hash."
# It takes your JWT payload + your secret key and produces the signature.
# SHA-256 is a hashing algorithm that takes any input and produces a fixed-length fingerprint.
# Used everywhere (file integrity checks, TLS, etc.)
# HMAC (Hash-based Message Authentication Code) uses a hash function with a secret key to produce a signature.
# You mix your secret key into the hashing process, so only someone with that key can produce the same output.
# HS256 is symmetric, meaning the same key signs and verifies tokens.

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All environment variables the app needs to run.

    pydantic-settings reads from the .env file and validates every value on startup,
        - Will raise an error if any required variable is missing or malformed.
    """

    database_url: str

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_days: int = 7  # 7-day access token MVP expiry — no refresh tokens yet, harden before production

    cors_origins: str  # the single allowed CORS origin — set in .env for every environment

    # Sentry error monitoring. Optional: when sentry_dsn is unset (local dev),
    # Sentry init is skipped and the app runs exactly as before. Set SENTRY_DSN
    # (from the listn-backend Sentry project) in production to start reporting.
    sentry_dsn: str | None = None
    sentry_environment: str = "development"  # tags events; set to "production" on Railway

    # Kill-switch for the weekly-streak side effect on rating/comparison finalize.
    # Streaks are a best-effort cache derived from rating_events; flipping this off
    # disables the finalize hook and read surface without a code rollback.
    streaks_enabled: bool = True

    # --- Password reset / transactional email -------------------------------
    # Pluggable email backend, selected by EMAIL_PROVIDER:
    #   "console" (default): log the message (incl. the reset code) instead of
    #       sending, so the flow is fully testable with no external service.
    #   "smtp": send via SMTP (e.g. Gmail with an App Password). Free, no domain
    #       needed. Set smtp_username/smtp_password and email_from.
    #   "resend": send via the Resend API. Best deliverability; needs a verified
    #       sending domain. Set resend_api_key and a domain email_from.
    # A real provider (smtp/resend) selected without its credentials does NOT
    # fall back to logging — it fails closed (warns, drops the message) so a
    # missing secret never leaks a live reset code into the logs. "console" is a
    # dev/test-only backend that logs the code; never select it in production.
    email_provider: str = "console"

    # SMTP backend (email_provider="smtp"). For Gmail the host/port defaults work;
    # smtp_username is the full address and smtp_password is a Google App Password
    # (requires 2FA). Gmail sends From the authenticated account, so email_from
    # should be that same address.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None

    # Resend backend (email_provider="resend").
    resend_api_key: str | None = None

    # From address on outbound mail. For smtp it must be the authenticated account
    # (e.g. "LISTn <your-app@gmail.com>"); for resend it must be an address on your
    # verified domain. Defaults to the Resend sandbox sender.
    email_from: str = "LISTn <onboarding@resend.dev>"

    # Optional override for the per-email reset-throttle HMAC key. When unset,
    # the key is derived from jwt_secret_key with domain separation, so no new
    # required secret is introduced. Set EMAIL_HASH_PEPPER to rotate it
    # independently of the JWT secret.
    email_hash_pepper: str | None = None

    # Per-email login throttle: per-IP limits alone are evadable by rotating source
    # addresses, so failed logins are ALSO capped per account (HMAC-keyed email).
    # The check runs before user lookup and behaves identically for known/unknown
    # emails, so it never becomes an enumeration oracle. NIST-friendly: 10 failures
    # per 15-minute window throttles online guessing without hard-locking accounts.
    login_max_failures_per_window: int = 10
    login_failure_window_minutes: int = 15

    # Password-reset tunables (config-driven so they can change without a deploy).
    reset_code_ttl_minutes: int = 15
    reset_code_max_attempts: int = 5
    reset_resend_cooldown_seconds: int = 60  # per-email cooldown between reset emails
    reset_max_requests_per_window: int = 5   # per-email cap of reset emails per window
    reset_request_window_minutes: int = 60   # window the per-email cap applies over

    # Breached-password screening via Have I Been Pwned (k-anonymity: only the
    # first 5 chars of the SHA-1 are sent). Enforced at register + reset, fail-open
    # (a HIBP outage never blocks setting a password). Flip enabled off to disable.
    pwned_password_check_enabled: bool = True
    pwned_password_threshold: int = 0  # reject when breach count exceeds this (0 = reject if seen at all)

    # MusicBrainz enrichment retry sweep: an in-process asyncio loop (single worker;
    # a queue was rejected by decision) that re-attempts songs stuck in "pending" or
    # "failed_temporary". The loop sleeps BEFORE its first pass, so short-lived
    # processes (tests, TestClient lifespans) never generate MusicBrainz traffic.
    enrichment_sweep_enabled: bool = True
    enrichment_sweep_interval_seconds: int = 600
    enrichment_sweep_batch_size: int = 20
    enrichment_max_attempts: int = 5  # terminal give-up cap per song across all retries

    # Global New Release feed batch (weekly, server-side, cached — never client-direct):
    # ListenBrainz fresh releases → Apple UPC lookup → durable songs → daily-rotating pick.
    # The loop sleeps before its first check, so tests never call providers.
    new_release_feed_enabled: bool = True
    new_release_refresh_days: int = 7           # batch window and staleness threshold
    new_release_check_interval_seconds: int = 3600
    new_release_target: int = 7                 # featured releases per batch (one per day)
    new_release_scan_cap: int = 60              # max candidates examined per batch
    new_release_storefront: str = "US"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
    )


# Single shared instance imported everywhere with:
#   from src.core.config import settings
settings = Settings()
