from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRegister(BaseModel):
    """
    Shape of the request body for POST /auth/register.

    This is what the client sends — email, plain-text password, name, username.
    The plain-text password is hashed in the service layer before it ever touches the DB.
    """

    email: EmailStr # a Pydantic type that validates email format automatically. Without it, "notanemail" would be accepted as a valid string.
    password: str = Field(min_length=8, max_length=72) # bcrypt truncates pws longer than 72 bytes, so accepting longer ones would be a security bug (2 diff pws could hash identically).
    name: str = Field(min_length=1, max_length=100)
    username: str = Field(min_length=1, max_length=30)


class UserResponse(BaseModel):
    """
    Shape of the response body when returning a user to the client.

    hashed_password is intentionally excluded — never expose it in any response.
    from_attributes=True lets Pydantic read directly off a SQLAlchemy model instance.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: datetime


class Token(BaseModel):
    """
    Shape of the response body for POST /auth/login.

    access_token is the JWT string the client stores and sends on future requests.
    token_type is always "bearer" — it tells the client how to format the Authorization header.
    """

    access_token: str
    token_type: str = "bearer"
