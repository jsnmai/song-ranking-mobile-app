from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.core.security import create_access_token, hash_password, verify_password
from src.schemas.user import Token, UserRegister, UserResponse
from src.repositories import user as user_repo


def register_user(db: Session, data: UserRegister) -> UserResponse:
    """
    Register a new user account.

    Decision chain:
    1. Does a user with this email already exist? → 409 if yes
    2. Hash the password — plain-text never touches the DB
    3. Create the user row via the repository
    4. Return the new user as a UserResponse (no hashed_password)
    """
    existing = user_repo.get_by_email(db, data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    hashed = hash_password(data.password)
    user = user_repo.create_user(db, email=data.email, hashed_password=hashed)
    return UserResponse.model_validate(user)


def login_user(db: Session, email: str, password: str) -> Token:
    """
    Authenticate a user and return a JWT access token.

    Decision chain:
    1. Does a user with this email exist? → 401 if not
    2. Does the password match the stored hash? → 401 if not
    3. Issue a JWT with the user ID as the subject claim
    Both failures return the same 401 message — prevents email enumeration
    (callers cannot tell which check failed).
    """
    user = user_repo.get_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)
