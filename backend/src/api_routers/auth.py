# HTTP layer for authentication endpoints.
# Routers are intentionally thin: parse the request, call the service, return the result.
# All business logic lives in src/services/auth.py.
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.user import (
    AccountDeleteRequest,
    RegisterResponse,
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
)
from src.services.auth import delete_current_user, login_user, register_user
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)

@router.post(  # decorators registers function below as an HTTP endpoint.
    "/register",  # tells FastAPI: "when a POST request comes in to /register, call this function."
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
def register(
    request: Request,
    data: UserRegister,
    db: Session = Depends(get_db),
) -> RegisterResponse:
    """Create a new user account and return a JWT. Rate limited to block automated sign-up spam."""
    return register_user(
        db,
        data,
    )


@router.post(
    "/login",
    response_model=Token,
)
@limiter.limit("5/minute")
def login(
    request: Request,
    data: UserLogin,
    db: Session = Depends(get_db),
) -> Token:
    """
    Authenticate and return a JWT access token.

    The client stores this token (in expo-secure-store on mobile) and sends it
    as a Bearer token on every subsequent request that requires authentication.
    Rate limited to block password brute-force attempts.
    """
    return login_user(
        db,
        data.email,
        data.password,
    )


@router.get(
    "/me",
    response_model=UserResponse,
)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """
    Return the currently authenticated user.

    The frontend calls this on app launch to verify a stored token is still valid
    and to load the user's identity (id, email) before showing the main app.
    If the token is missing, expired, or tampered with, get_current_user
    automatically raises a 401 before this function is ever called — this route never sees an invalid token.

    This is also a template for all future protected routes in the app:
    add `current_user: User = Depends(get_current_user)` to any route handler
    and it becomes authentication-required automatically.
    """
    return current_user


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_me(
    data: AccountDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Delete the authenticated account and its row-level user-owned data."""
    if data.confirmation != "DELETE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Type DELETE to confirm account deletion.",
        )
    delete_current_user(
        db,
        current_user,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
