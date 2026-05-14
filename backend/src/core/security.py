from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from src.core.config import settings


def hash_password(plain: str) -> str:
    """
    Hash a plain-text password using bcrypt.

    bcrypt is deliberately slow (work factor 12 = 2^12 rounds) to make
    brute-force guessing impractical even if the database is stolen.
    Returns a string like '$2b$12$...' that is safe to store in the DB.
    There is no way to reverse this back to the original password.
    """
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """
    Check whether a plain-text password matches a stored bcrypt hash.

    bcrypt re-hashes the plain text internally and compares — you never decrypt.
    Returns True if they match, False otherwise.
    """
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict) -> str:
    """
    Create a signed JWT containing the given payload.

    Adds an 'exp' claim so the token expires after settings.jwt_expiry_days.
    The token is signed with JWT_SECRET_KEY — anyone can read the payload,
    but only this server can produce a valid signature.
    """
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expiry_days)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """
    Verify a JWT's signature and expiry, then return its payload.

    Raises jose.JWTError if the token is expired, tampered with,
    or signed with the wrong key. The caller is responsible for
    catching this and returning a 401.
    """
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
