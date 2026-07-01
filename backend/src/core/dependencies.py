# FastAPI dependency functions injected into route handlers via Depends().
# get_db provides a per-request database session; get_current_user enforces
# authentication on any route that declares it as a dependency.
from typing import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from src.core.security import decode_access_token
from src.crud.user import get_by_id
from src.db.session import SessionLocal
from src.sqlalchemy_tables.user import User

# tokenUrl tells FastAPI (and Swagger UI) where clients submit credentials to
# obtain a token. The value must match the actual login endpoint path.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_db() -> Generator[Session, None, None]:
    """
    Yield a SQLAlchemy session for the duration of a single request.

    FastAPI calls this before the route handler and closes the session
    after the response is sent, even if the handler raised an exception.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Decode the JWT from the Authorization header and return the matching User.

    Raises HTTP 401 if:
    - The token is missing, expired, or tampered with
    - The 'sub' claim (user ID) is absent from the payload
    - No user exists in the database for that ID
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        user_id_int = int(user_id)
    except (JWTError, ValueError):
        raise credentials_exception

    user = get_by_id(
        db,
        user_id_int,
    )
    if user is None:
        raise credentials_exception

    # Session invalidation: when the user has reset their password, every token
    # issued at or before that moment is rejected, forcing other devices to
    # re-login. iat is integer-second epoch, so compare with <= — a token minted
    # in the same second as the reset must not survive. A token with no iat
    # (issued before this feature) is also rejected once a reset has happened.
    if user.password_changed_at is not None:
        issued_at = payload.get("iat")
        if issued_at is None or issued_at <= int(user.password_changed_at.timestamp()):
            raise credentials_exception

    return user
