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

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
    )


# Single shared instance imported everywhere with:
#   from src.core.config import settings
settings = Settings()
