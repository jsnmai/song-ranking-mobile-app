# Database access layer for the users table.
# All SQL queries for users live here. Nothing outside this module should
# construct a SQLAlchemy query against the users table directly.
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.user import User


def get_by_email(
    db: Session,
    email: str,
) -> User | None:
    """Return the User with this email, or None if no matching row is found."""
    return db.execute(
        select(User)
        .where(User.email == email)
    ).scalar_one_or_none()


def get_by_id(
    db: Session,
    user_id: int,
) -> User | None:
    """Return the User with this primary key, or None if no matching row is found."""
    return db.execute(
        select(User)
        .where(User.id == user_id)
    ).scalar_one_or_none()


def create_user(
    db: Session,
    email: str,
    hashed_password: str,
) -> User:
    """
    Insert a new user row and return the saved instance.

    The caller must verify the email is not already taken — a duplicate will
    raise an IntegrityError from the database unique constraint.
    db.refresh() reloads the row after commit so id and created_at are populated.
    """
    user = User(
        email=email,
        hashed_password=hashed_password,
    )
    db.add(user)
    db.commit()
    db.refresh(user)  # reloads the row from DB so id and created_at are populated
    return user
