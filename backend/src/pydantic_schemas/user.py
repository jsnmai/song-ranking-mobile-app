# Pydantic schemas define the shapes of request bodies and response payloads.
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRegister(BaseModel):
    """Request body for POST /auth/register and POST /auth/login."""
    email: EmailStr  # a Pydantic type that validates email format automatically. i.e. rejects "notanemail"
    password: str = Field(
        min_length=8,  
        max_length=72,  # bcrypt limit — over 72 chars are silently truncated, making two passwords hash identically
    )


class UserResponse(BaseModel):
    """
    Response body for any endpoint that returns a user.
    
    hashed_password is intentionally excluded — never expose it in any response.
    from_attributes=True lets Pydantic read fields directly off a SQLAlchemy model instance.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: datetime


class Token(BaseModel):
    """Response body for POST /auth/login."""

    access_token: str  # JWT the client stores in expo-secure-store and sends as Bearer token
    token_type: str = "bearer"  # always "bearer" per OAuth2 spec, tells client how to format the Authorization header.
