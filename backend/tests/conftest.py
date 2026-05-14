import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from src.core.dependencies import get_db
from src.db.base import Base
import src.sqlalchemy_tables.user  # noqa: F401 — registers User with Base.metadata so create_all() creates the table
# Add a new import here each time a new model file is created.

# Separate database for tests — never runs against the dev database.
# You must create this database once: createdb listn_test
TEST_DATABASE_URL = "postgresql+psycopg2://postgres:postgres@localhost:5432/listn_test"

test_engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    """Create all tables once at the start of the test session, drop them at the end."""
    Base.metadata.create_all(test_engine)
    yield
    Base.metadata.drop_all(test_engine)


@pytest.fixture(autouse=True)
def clear_tables():
    """Delete all rows after each test so tests cannot affect each other."""
    yield
    db = TestingSessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    finally:
        db.close()


@pytest.fixture
def client():
    """
    TestClient with get_db overridden to use the test database.

    dependency_overrides replaces get_db for the duration of the test,
    then clears it so other tests start clean.
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
