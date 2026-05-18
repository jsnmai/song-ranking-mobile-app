# Business logic for authentication.
# All decisions about what constitutes a valid registration or login live here.
# The router calls these functions; this layer calls the crud layer for data access.
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.core.security import create_access_token, hash_password, verify_password
from src.crud.profile import get_by_username
from src.crud.user import create_user_with_profile, get_by_email
from src.pydantic_schemas.user import RegisterResponse, Token, UserLogin, UserRegister, UserResponse


def register_user(
    db: Session,
    data: UserRegister,
) -> RegisterResponse:
    """
    Register a new user account with profile in a single atomic transaction.

    1. Email already exists? → 409
    2. Username already taken? → 409
    3. Hash the password — plain-text never touches the DB
    4. Create user + profile atomically — if either insert fails, both roll back
    5. Issue a JWT and return it alongside the user — client needs no separate login call

    The IntegrityError catch handles the race window between steps 2 and 4.
    The psycopg2 error string contains the column name, so the right 409 message
    is returned (username vs email) even when two requests slip through simultaneously.
    """
    if get_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    if get_by_username(db, data.username):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken.",
        )

    hashed = hash_password(data.password)
    try:
        user = create_user_with_profile(
            db,
            email=data.email,
            hashed_password=hashed,
            username=data.username,  # already lowercased by the Pydantic validator
            display_name=data.display_name,
        )
    except IntegrityError as err:
        db.rollback()
        # Inspect the underlying psycopg2 error to distinguish which unique constraint fired.
        # The error string contains the column name, e.g. "Key (username)=(...) already exists."
        if "username" in str(err.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    token = create_access_token({"sub": str(user.id)})
    return RegisterResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


def login_user(
    db: Session,
    email: str,
    password: str,
) -> Token:
    """
    Authenticate a user and return a JWT access token.

    1. User with this email exists? → 401 if not
    2. Password matches the stored hash? → 401 if not
    3. Issue a JWT with the user ID as the subject claim

    Both failures return the same 401 — prevents email enumeration.
    """
    user = get_by_email(
        db,
        email,
    )
    # short-circuit: verify_password only runs when user exists — avoids AttributeError on None
    if not user or not verify_password(
        password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)
