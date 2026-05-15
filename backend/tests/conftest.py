# Shared pytest fixtures for all backend tests.
# Sets up a dedicated test database, creates schema once per session,
# and tears down rows between tests to keep each test isolated.
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import src.sqlalchemy_tables.user  # noqa: F401 — registers User with Base.metadata so create_all() creates the table
from main import app
from src.core.dependencies import get_db
from src.db.base import Base

# Add a new import here each time a new model file is created.

# Isolated test database — never touches the development database.
# Create it once before running tests: createdb listn_test
TEST_DATABASE_URL = "postgresql+psycopg2://postgres:postgres@localhost:5432/listn_test"

test_engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(
    bind=test_engine,
    autocommit=False,
    autoflush=False,
)


@pytest.fixture(
    scope="session",
    autouse=True,
)
def create_tables() -> None:
    """
    Create all tables once at the start of the test session, drop them at the end.

    session scope means this runs once for the entire pytest run, not once per test,
    which avoids the overhead of recreating the schema for every test function.
    """
    Base.metadata.create_all(test_engine)
    yield
    Base.metadata.drop_all(test_engine)


@pytest.fixture(autouse=True)
def clear_tables() -> None:
    """
    Delete all rows after each test so tests cannot bleed state into one another.

    reversed(sorted_tables) respects foreign key order — child rows are deleted
    before parent rows to avoid constraint violations.
    """
    yield
    db = TestingSessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    finally:
        db.close()


@pytest.fixture
def client() -> TestClient:
    """
    TestClient wired to the test database via a get_db dependency override.

    dependency_overrides swaps get_db for the duration of this fixture so every
    request the test client makes uses the test session instead of the dev session.
    The override is cleared after the test to avoid leaking into other tests.
    """
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
