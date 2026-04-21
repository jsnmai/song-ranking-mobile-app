from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.core.dependencies import get_db
from src.schemas.user import Token, UserRegister, UserResponse
from src.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user account and return the created user."""
    return auth_service.register_user(db, data)


@router.post("/login", response_model=Token)
def login(data: UserRegister, db: Session = Depends(get_db)):
    """Authenticate with email and password and return a JWT access token."""
    return auth_service.login_user(db, data.email, data.password)
