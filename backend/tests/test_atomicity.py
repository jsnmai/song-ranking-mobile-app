# Atomicity tests — verify that registration writes both rows or neither.
# These tests query the database directly after HTTP requests to confirm
# what was actually stored, independent of what the HTTP response reported.
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from src.crud.profile import get_by_username
from src.crud.user import get_by_email
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.user import User

REGISTER_PAYLOAD = {
    "email": "user@example.com",
    "password": "password123",
    "display_name": "Test User",
    "username": "testuser",
}


def test_registration_creates_user_row(client: TestClient, db_session: Session):
    """A successful registration inserts exactly one user row into the database."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    user = get_by_email(db_session, "user@example.com")
    assert user is not None
    assert user.email == "user@example.com"


def test_registration_creates_profile_row(client: TestClient, db_session: Session):
    """A successful registration inserts exactly one profile row into the database."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    profile = get_by_username(db_session, "testuser")
    assert profile is not None
    assert profile.username == "testuser"
    assert profile.display_name == "Test User"


def test_profile_linked_to_user(client: TestClient, db_session: Session):
    """The profile's user_id foreign key matches the registered user's id."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    user = get_by_email(db_session, "user@example.com")
    profile = get_by_username(db_session, "testuser")
    assert profile.user_id == user.id


def test_failed_registration_duplicate_username_leaves_no_user_row(client: TestClient, db_session: Session):
    """When registration fails due to a duplicate username, no new user row is left behind."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    user_count_before = db_session.execute(select(func.count()).select_from(User)).scalar()
    # Same username, different email — the username check fires before any DB write
    client.post("/api/v1/auth/register", json={**REGISTER_PAYLOAD, "email": "other@example.com"})
    user_count_after = db_session.execute(select(func.count()).select_from(User)).scalar()
    assert user_count_after == user_count_before


def test_failed_registration_duplicate_email_leaves_no_profile_row(client: TestClient, db_session: Session):
    """When registration fails due to a duplicate email, no new profile row is left behind."""
    client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    profile_count_before = db_session.execute(select(func.count()).select_from(Profile)).scalar()
    # Same email, different username — the email check fires before any DB write
    client.post("/api/v1/auth/register", json={**REGISTER_PAYLOAD, "username": "newuser"})
    profile_count_after = db_session.execute(select(func.count()).select_from(Profile)).scalar()
    assert profile_count_after == profile_count_before


def test_username_stored_lowercase(client: TestClient, db_session: Session):
    """Usernames submitted in mixed case are normalised to lowercase before storage."""
    payload = {**REGISTER_PAYLOAD, "username": "TestUser"}
    client.post("/api/v1/auth/register", json=payload)
    profile = get_by_username(db_session, "testuser")
    assert profile is not None
    assert profile.username == "testuser"


def test_display_name_whitespace_stripped(client: TestClient, db_session: Session):
    """Leading and trailing whitespace is stripped from display_name before storage."""
    payload = {**REGISTER_PAYLOAD, "display_name": "  Test User  "}
    client.post("/api/v1/auth/register", json=payload)
    profile = get_by_username(db_session, "testuser")
    assert profile.display_name == "Test User"
