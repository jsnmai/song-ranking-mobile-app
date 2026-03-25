from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from src.core.config import settings

# CryptContext tells passlib which algorithm to use.
# We select bcrypt as our hashing algorithm (called scheme by passlib)
# "deprecated='auto'" means if we ever add a newer algorithm, old hashes are flagged for rehashing automatically.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Token expiry — 7 days (MVP; no refresh tokens yet)
# Defer refresh tokens for now, then harden before production.
ACCESS_TOKEN_EXPIRE_DAYS = 7

# The algorithm used to sign JWTs. HS256 = HMAC + SHA-256.
# SHA-256 is a hashing algorithm — takes any input and produces a fixed-length fingerprint. 
# Used everywhere (file integrity checks, TLS, etc.)
# HMAC (Hash-based Message Authentication Code) is a way to use a hash function with a secret key to produce a signature. 
# You mix your secret key into the hashing process, so only someone with that key can produce the same output.                        
# HS256 = "use HMAC with SHA-256 as the underlying hash." It takes your JWT payload + your secret key and produces the signature.  
# Symmetric — same secret key signs and verifies. 
ALGORITHM = "HS256"


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

    Adds an 'exp' claim so the token expires after ACCESS_TOKEN_EXPIRE_DAYS.
    The token is signed with JWT_SECRET_KEY — anyone can read the payload,
    but only this server can produce a valid signature.
    """
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Verify a JWT's signature and expiry, then return its payload.

    Raises jose.JWTError if the token is expired, tampered with,
    or signed with the wrong key. The caller is responsible for
    catching this and returning a 401.
    """
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
