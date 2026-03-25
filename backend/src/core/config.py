from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All environment variables the app needs to run.
    Pydantic will raise an error on startup if any required variable is missing.
    """

    # Database
    database_url: str

    # JWT
    # The algorithm used to sign JWTs. HS256 = HMAC + SHA-256.
    # SHA-256 is a hashing algorithm — takes any input and produces a fixed-length fingerprint. 
    # Used everywhere (file integrity checks, TLS, etc.)
    # HMAC (Hash-based Message Authentication Code) is a way to use a hash function with a secret key to produce a signature. 
    # You mix your secret key into the hashing process, so only someone with that key can produce the same output.                        
    # HS256 = "use HMAC with SHA-256 as the underlying hash." It takes your JWT payload + your secret key and produces the signature.  
    # Symmetric — same secret key signs and verifies. 
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"        # HS256 = HMAC + SHA-256 — symmetric, same key signs and verifies
    jwt_expiry_days: int = 7            # 7-day access token MVP expiry — no refresh tokens yet, harden before production

    cors_origins: str = "http://localhost:8081"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
    )


# Single instance imported everywhere:
# from src.core.config import settings
settings = Settings()