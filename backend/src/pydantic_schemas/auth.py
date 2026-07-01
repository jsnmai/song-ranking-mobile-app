# Pydantic schemas for the password-reset flow.
from pydantic import BaseModel, EmailStr, Field


class ForgotPasswordRequest(BaseModel):
    """Request body for POST /auth/forgot-password."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Request body for POST /auth/reset-password."""

    email: EmailStr
    code: str
    new_password: str = Field(
        min_length=8,
        max_length=72,  # bcrypt limit — same policy as register/login
    )


class GenericMessage(BaseModel):
    """Generic, enumeration-safe response for the forgot-password endpoint."""

    message: str
