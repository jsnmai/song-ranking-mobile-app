# Pydantic schemas define the shapes of request bodies and response payloads.
import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserLogin(BaseModel):
    """Request body for POST /auth/login."""
    email: EmailStr
    password: str = Field(
        min_length=8,
        max_length=72,  # bcrypt limit — over 72 chars are silently truncated, making two passwords hash identically
    )


class UserRegister(BaseModel):
    """Request body for POST /auth/register."""
    email: EmailStr
    password: str = Field(
        min_length=8,
        max_length=72,
    )
    display_name: str = Field(
        min_length=1,
        max_length=30,
    )
    username: str = Field(
        min_length=3,
        max_length=20,
    )

    @field_validator("username")
    @classmethod
    def username_valid_chars(cls, value: str) -> str:
        """Reject usernames with anything other than letters, numbers, or underscores."""
        if not re.match(r"^[a-zA-Z0-9_]+$", value):
            raise ValueError("Username may only contain letters, numbers, and underscores.")
        return value.lower()

    @field_validator("display_name")
    @classmethod
    def display_name_strip(cls, value: str) -> str:
        """Strip leading and trailing whitespace from the display name."""
        return value.strip()


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


class RegisterResponse(BaseModel):
    """Response body for POST /auth/register — includes a JWT so the client needs no separate login call."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
