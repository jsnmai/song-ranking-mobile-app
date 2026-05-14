from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.sqlalchemy_tables.user import User
from src.pydantic_schemas.user import Token, UserRegister, UserResponse
from src.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def register(request: Request, data: UserRegister, db: Session = Depends(get_db)):
    """
    Create a new user account.

    Accepts email + password, hashes the password, stores the user, and returns
    the new user profile (no password). Rate limited to block automated sign-up spam.
    """
    return auth_service.register_user(db, data)


@router.post("/login", response_model=Token)
@limiter.limit("20/minute")
def login(request: Request, data: UserRegister, db: Session = Depends(get_db)):
    """
    Authenticate and receive a JWT access token.

    The client stores this token (in expo-secure-store on mobile) and sends it
    as a Bearer token on every subsequent request that requires authentication.
    Rate limited to block password brute-force attempts.
    """
    return auth_service.login_user(db, data.email, data.password)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """
    Return the currently authenticated user.

    The frontend calls this on app launch to verify a stored token is still valid
    and to load the user's identity (id, email) before showing the main app.
    If the token is missing, expired, or tampered with, get_current_user
    automatically returns a 401 — this route never sees an invalid token.

    This is also a template for every future protected route in the app:
    add `current_user: User = Depends(get_current_user)` to any route handler
    and it becomes authentication-required automatically.
    """
    return current_user
