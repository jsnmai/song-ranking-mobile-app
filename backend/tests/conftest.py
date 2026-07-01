# Shared pytest fixtures for all backend tests.
# Sets up a dedicated test database, creates schema once per session,
# and tears down rows between tests to keep each test isolated.
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import src.sqlalchemy_tables.auxstrology_snapshot  # noqa: F401 — registers AuxstrologySnapshot with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.block  # noqa: F401 — registers Block with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.bookmark  # noqa: F401 — registers Bookmark with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.comparison  # noqa: F401 — registers Comparison with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.comparison_session  # noqa: F401 — registers ComparisonSession with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.follow  # noqa: F401 — registers Follow with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.interaction_event  # noqa: F401 — registers InteractionEvent with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.like  # noqa: F401 — registers Like with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.notification  # noqa: F401 — registers Notification with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.password_reset_request  # noqa: F401 — registers PasswordResetRequest with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.password_reset_token  # noqa: F401 — registers PasswordResetToken with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.profile  # noqa: F401 — registers Profile with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.ranking  # noqa: F401 — registers Ranking with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.rating_event  # noqa: F401 — registers RatingEvent with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.report  # noqa: F401 — registers Report with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.song  # noqa: F401 — registers Song with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.song_provider_ref  # noqa: F401 — registers SongProviderRef with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.user  # noqa: F401 — registers User with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.user_similarity_snapshot  # noqa: F401 — registers UserSimilaritySnapshot with Base.metadata so create_all() creates the table
import src.sqlalchemy_tables.user_streak  # noqa: F401 — registers UserStreak with Base.metadata so create_all() creates the table

# Add a new import here each time a new model file is created.
from main import app
from src.core.dependencies import get_db
from src.core.limiter import limiter
from src.db.base import Base

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


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    """
    Clear the in-memory rate limiter counters before each test.

    Without this, requests made in one test count toward the limit in the next,
    making rate limit tests non-deterministic and causing false 429s in unrelated tests.
    """
    limiter._storage.reset()
    yield


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


@pytest.fixture(autouse=True)
def block_musicbrainz_http(monkeypatch) -> None:
    """
    Prevent any real MusicBrainz HTTP calls during tests.

    Rating finalize now triggers best-effort enrichment. Without this guard every
    test that finalizes a rating would attempt a live network call, making the
    suite slow and fragile. Individual musicbrainz tests override this fixture by
    calling monkeypatch.setattr on the same names inside their own test body —
    the last setattr on the same target wins because they share the same monkeypatch
    instance.
    """
    monkeypatch.setattr(
        "src.services.musicbrainz.httpx.get",
        lambda *args, **kwargs: (_ for _ in ()).throw(httpx.ConnectError("MusicBrainz blocked in tests")),
    )
    monkeypatch.setattr(
        "src.services.musicbrainz.time.sleep",
        lambda seconds: None,
    )


@pytest.fixture(autouse=True)
def neutralize_pwned_password_check(monkeypatch) -> None:
    """
    Treat no password as breached by default, so register/reset tests run offline
    with any password. Tests that exercise the real behavior override
    src.services.auth.is_password_pwned (integration) or mock
    src.services.pwned_passwords.httpx.get (unit) in their own body — the last
    setattr on a target wins because they share this monkeypatch instance.
    """
    monkeypatch.setattr(
        "src.services.auth.is_password_pwned",
        lambda password: False,
    )


@pytest.fixture
def db_session() -> Session:
    """
    Direct database session for tests that need to inspect row state after an HTTP request.

    Used by atomicity tests to verify what was actually written to the database,
    independent of what the HTTP response reported.
    """
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
