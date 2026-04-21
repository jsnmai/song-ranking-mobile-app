from typing import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from src.core.security import decode_access_token
from src.db.session import SessionLocal
from src.models.user import User
from src.repositories import user as user_repo

# Tells FastAPI where clients send their token.
# When a route declares Depends(get_current_user), Swagger UI will show a
# login form and automatically attach the token to requests.
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
    except JWTError:
        raise credentials_exception

    user = user_repo.get_by_id(db, int(user_id))
    if user is None:
        raise credentials_exception

    return user
