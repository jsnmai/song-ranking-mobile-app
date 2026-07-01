# Helpers for password storage and JWT creation/verification.

import hmac
from datetime import datetime, timedelta, timezone
from hashlib import sha256

import bcrypt
from jose import jwt

from src.core.config import settings

# Domain-separation label so the throttle HMAC derived from jwt_secret_key can
# never collide with the JWT signature, even though they share the same secret.
_EMAIL_THROTTLE_DOMAIN = b"listn-email-throttle-v1"


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


# A throwaway bcrypt hash, computed once at import. dummy_verify() runs a real
# bcrypt comparison against it to burn the same ~250ms a genuine verify costs.
# Failure paths that would otherwise skip hashing call it so response timing can
# never reveal whether an account (or an active reset token) exists — the account
# non-existence "fast path" is a classic user-enumeration oracle.
_DECOY_HASH = bcrypt.hashpw(b"decoy", bcrypt.gensalt()).decode()


def dummy_verify() -> None:
    """Spend one bcrypt verify's worth of time to equalize auth-failure timing."""
    bcrypt.checkpw(b"decoy", _DECOY_HASH.encode())


def create_access_token(data: dict) -> str:
    """
    Return a signed JWT containing the given payload plus an expiry claim.

    The token is signed with JWT_SECRET_KEY — anyone can read the payload,
    but only this server can produce a valid signature. Anyone with the secret
    key can forge tokens, so it must never be committed or logged.
    """
    payload = data.copy()
    now = datetime.now(timezone.utc)
    payload["iat"] = now  # issued-at — compared against users.password_changed_at to invalidate old sessions
    payload["exp"] = now + timedelta(days=settings.jwt_expiry_days)
    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def email_throttle_hash(email: str) -> str:
    """
    Return a keyed HMAC-SHA256 hex digest of the normalized email.

    Used to key the per-email password-reset throttle without storing the
    plaintext address. Plain SHA-256 would be dictionary-reversible since emails
    are low-entropy; HMAC with a server-side key makes the throttle table
    useless to anyone who lacks the key.

    The key is the optional EMAIL_HASH_PEPPER override when set, otherwise it is
    derived from jwt_secret_key with a domain-separation label so no new
    required secret is needed.
    """
    normalized = email.strip().lower()
    if settings.email_hash_pepper:
        key = settings.email_hash_pepper.encode()
    else:
        key = hmac.new(
            settings.jwt_secret_key.encode(),
            _EMAIL_THROTTLE_DOMAIN,
            sha256,
        ).digest()
    return hmac.new(
        key,
        normalized.encode(),
        sha256,
    ).hexdigest()


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
