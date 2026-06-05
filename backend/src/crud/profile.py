# Database access layer for the profiles table.
# All SQL queries for profiles live here. Nothing outside this module should
# construct a SQLAlchemy query against the profiles table directly.
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.profile import Profile


def get_by_user_id(
    db: Session,
    user_id: int,
) -> Profile | None:
    """Return the Profile for this user, or None if the user has no profile yet."""
    return db.execute(
        select(Profile)
        .where(Profile.user_id == user_id)
    ).scalar_one_or_none()


def get_by_username(
    db: Session,
    username: str,
) -> Profile | None:
    """Return the Profile with this username, or None if not found.

    username is always compared lowercase — callers must pass a lowercased value.
    """
    return db.execute(
        select(Profile)
        .where(Profile.username == username.lower())
    ).scalar_one_or_none()


def search_by_username(
    db: Session,
    query: str,
    limit: int = 20,
) -> list[Profile]:
    """Return profiles whose username or display name matches the search query."""
    pattern = f"%{query.lower()}%"
    return list(
        db.execute(
            select(Profile)
            .where(
                Profile.username.ilike(pattern)
                | Profile.display_name.ilike(pattern)
            )
            .order_by(Profile.username.asc())
            .limit(limit)
        ).scalars()
    )


def create_profile(
    db: Session,
    user_id: int,
    username: str,
    display_name: str,
) -> Profile:
    """
    Stage a new profile row and return the flushed instance.

    Caller must verify the username is not already taken — a duplicate raises IntegrityError.
    username must already be lowercased before being passed here.
    """
    profile = Profile(
        user_id=user_id,
        username=username,
        display_name=display_name,
    )
    db.add(profile)
    db.flush()
    return profile
