# Database access layer for the users table.
# All SQL queries for users live here. Nothing outside this module should
# construct a SQLAlchemy query against the users table directly.
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.profile import Profile
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


def create_user_with_profile(
    db: Session,
    email: str,
    hashed_password: str,
    username: str,
    display_name: str,
    age_verified_13_plus: bool,
    age_verified_at: datetime,
    age_gate_version: str,
) -> User:
    """
    Stage a user row and a profile row in the current database transaction.

    1. db.add(user) — stages the user INSERT, nothing written yet
    2. db.flush() — sends the INSERT within the open transaction, populating user.id without committing
    3. db.add(profile) — stages the profile INSERT, referencing user.id as the foreign key
    4. db.flush() — validates the profile INSERT while the service still owns commit/rollback
    """
    user = User(
        email=email,
        hashed_password=hashed_password,
        age_verified_13_plus=age_verified_13_plus,
        age_verified_at=age_verified_at,
        age_gate_version=age_gate_version,
    )
    db.add(user)
    db.flush()  # populates user.id without committing
    profile = Profile(
        user_id=user.id,
        username=username,
        display_name=display_name,
    )
    db.add(profile)
    db.flush()
    return user
