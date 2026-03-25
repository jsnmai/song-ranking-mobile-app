from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.user import User


def get_by_email(db: Session, email: str) -> User | None:
    """
    Fetch a user by email address.

    Returns the User if found, None if no matching row exists.
    Used during login to look up who is trying to sign in.
    """
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def get_by_id(db: Session, user_id: int) -> User | None:
    """
    Fetch a user by their primary key.

    Returns the User if found, None if no matching row exists.
    Used by get_current_user to load the user after decoding a JWT.
    """
    return db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()


def create_user(db: Session, email: str, hashed_password: str) -> User:
    """
    Insert a new user row and return the saved instance.

    The caller is responsible for checking that the email is not already
    taken before calling this. Passing a duplicate email will raise an
    IntegrityError from the database unique constraint.
    """
    user = User(email=email, hashed_password=hashed_password)
    db.add(user)
    db.commit()
    db.refresh(user)  # reloads the row from DB so id and created_at are populated
    return user
