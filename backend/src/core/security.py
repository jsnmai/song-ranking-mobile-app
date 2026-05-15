# Helpers for password storage and JWT creation/verification.

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from src.core.config import settings


def hash_password(plain_pw: str) -> str:
    """Hash a plain-text password with bcrypt. Safe to store in DB — cannot be reversed to the original."""
    return bcrypt.hashpw(
        plain_pw.encode(),
        bcrypt.gensalt(),
    ).decode()


def verify_password(
    plain_pw: str,
    hashed_pw: str,
) -> bool:
    """Return True if plain_pw matches the stored bcrypt hash, False otherwise."""
    return bcrypt.checkpw(
        plain_pw.encode(),
        hashed_pw.encode(),
    )


def create_access_token(data: dict) -> str:
    """
    Return a signed JWT containing the given payload plus an expiry claim.

    The token is signed with JWT_SECRET_KEY — anyone can read the payload,
    but only this server can produce a valid signature. Anyone with the secret
    key can forge tokens, so it must never be committed or logged.
    """
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expiry_days)
    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict:
    """
    Verify a JWT's signature and expiry, then return its payload.

    Raises jose.JWTError if the token is expired, tampered with, or signed
    with the wrong key. The caller is responsible for catching this and returning a 401.
    """
    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
