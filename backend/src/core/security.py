from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from src.core.config import settings # JWT config is centralized in settings (config.py) so it can be changed in one place.

# CryptContext tells passlib which algorithm to use.
# We select bcrypt as our hashing algorithm (called scheme by passlib)
# "deprecated='auto'" means if we ever add a newer algorithm, old hashes are flagged for rehashing automatically.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """
    Hash a plain-text password using bcrypt.

    Returns a string like '$2b$12$...' that is safe to store in the DB.
    There is no way to reverse this back to the original password.
    """
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Check whether a plain-text password matches a stored bcrypt hash.

    bcrypt re-hashes the plain password and compares — you never decrypt.
    Returns True if they match, False otherwise.
    """
    return pwd_context.verify(plain, hashed)


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
