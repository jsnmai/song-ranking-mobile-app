# Tests for the local dev demo seed script guards and idempotency.
import pytest
from sqlalchemy import func, select

from scripts.demo_seed_data import DEMO_ACCOUNTS, DEMO_EMAIL_DOMAIN, demo_email
from scripts.seed_dev_demo import (
    SeedAbortedError,
    assert_safe_database_url,
    assert_seed_environment,
    is_legacy_demo_email,
    purge_legacy_demo_users,
    seed_demo_data,
)
from src.core.security import hash_password
from src.crud.user import create_user_with_profile
from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.user import User
from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot
from tests.conftest import TEST_DATABASE_URL


def test_assert_seed_environment_requires_allow_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """Seed refuses to run without ALLOW_DEV_SEED=1."""
    monkeypatch.delenv("ALLOW_DEV_SEED", raising=False)
    monkeypatch.setattr(
        "scripts.seed_dev_demo.settings.database_url",
        TEST_DATABASE_URL,
    )

    with pytest.raises(SeedAbortedError, match="ALLOW_DEV_SEED"):
        assert_seed_environment()


def test_assert_safe_database_url_rejects_production_host() -> None:
    """Production-like URLs are blocked by the denylist."""
    with pytest.raises(SeedAbortedError, match="denylist"):
        assert_safe_database_url("postgresql+psycopg2://user:pass@foo.rds.amazonaws.com:5432/listn")


def test_demo_accounts_use_demo_listn_dev_domain() -> None:
    """Demo emails must use the login-valid @demo.listn.dev domain."""
    assert DEMO_EMAIL_DOMAIN == "@demo.listn.dev"
    for account in DEMO_ACCOUNTS:
        assert account.email.endswith(DEMO_EMAIL_DOMAIN)
        assert account.email == demo_email(account.username)


def test_is_legacy_demo_email_only_matches_known_demo_usernames() -> None:
    """Legacy cleanup is scoped to seeded demo usernames on @listn.test."""
    assert is_legacy_demo_email("demo_power@listn.test") is True
    assert is_legacy_demo_email("demo_power@demo.listn.dev") is False
    assert is_legacy_demo_email("other_user@listn.test") is False


def test_purge_legacy_demo_users_removes_listn_test_demo_only(
    db_session,
) -> None:
    """Legacy @listn.test demo rows are removed without touching current-domain demos."""
    legacy = create_user_with_profile(
        db_session,
        email="demo_power@listn.test",
        hashed_password=hash_password("listn1234"),
        username="legacy_demo_power",
        display_name="Legacy Demo Power",
    )
    current = create_user_with_profile(
        db_session,
        email=demo_email("demo_power"),
        hashed_password=hash_password("listn1234"),
        username="demo_power",
        display_name="Demo Power",
    )
    outsider = create_user_with_profile(
        db_session,
        email="other_user@listn.test",
        hashed_password=hash_password("listn1234"),
        username="other_user_test",
        display_name="Other User",
    )
    db_session.commit()
    legacy_id = legacy.id
    current_id = current.id
    outsider_id = outsider.id

    purge_legacy_demo_users(db_session)
    db_session.commit()

    remaining_ids = set(db_session.execute(select(User.id)).scalars().all())
    remaining_emails = set(db_session.execute(select(User.email)).scalars().all())
    assert "demo_power@listn.test" not in remaining_emails
    assert demo_email("demo_power") in remaining_emails
    assert "other_user@listn.test" in remaining_emails
    assert legacy_id not in remaining_ids
    assert current_id in remaining_ids
    assert outsider_id in remaining_ids


def test_assert_safe_database_url_rejects_unknown_host() -> None:
    """Only local docker/dev hosts are allowed."""
    with pytest.raises(SeedAbortedError, match="host"):
        assert_safe_database_url("postgresql+psycopg2://postgres:postgres@prod.internal:5432/listn")


def test_seed_demo_data_is_idempotent(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two seed passes on the test DB yield the same demo row counts and compatibility bands."""
    monkeypatch.setenv("ALLOW_DEV_SEED", "1")
    monkeypatch.setattr(
        "scripts.seed_dev_demo.settings.database_url",
        TEST_DATABASE_URL,
    )
    assert_seed_environment()

    first = seed_demo_data(db_session)
    db_session.commit()

    demo_emails = [account.email for account in DEMO_ACCOUNTS]
    demo_user_ids = list(
        db_session.execute(
            select(User.id).where(User.email.in_(demo_emails)),
        ).scalars(),
    )

    counts_after_first = _demo_counts(db_session, demo_user_ids)

    second = seed_demo_data(db_session)
    db_session.commit()

    counts_after_second = _demo_counts(db_session, demo_user_ids)

    assert counts_after_first == counts_after_second
    assert first.power_friend_similarity > 0.9
    assert first.power_opposite_similarity < 0.5
    assert second.power_friend_similarity > 0.9
    assert second.power_opposite_similarity < 0.5

    power_id = first.user_ids_by_username["demo_power"]
    feed_id = first.user_ids_by_username["demo_feed"]
    follow_count = db_session.execute(
        select(func.count())
        .select_from(Follow)
        .where(Follow.follower_id == power_id),
    ).scalar_one()
    feed_follow_count = db_session.execute(
        select(func.count())
        .select_from(Follow)
        .where(Follow.follower_id == feed_id),
    ).scalar_one()
    assert follow_count >= 5
    assert feed_follow_count >= 5


def _demo_counts(
    db_session,
    demo_user_ids: list[int],
) -> dict[str, int]:
    """Return stable counts for demo-scoped tables."""
    ranking_count = db_session.execute(
        select(func.count()).select_from(Ranking).where(Ranking.user_id.in_(demo_user_ids)),
    ).scalar_one()
    event_count = db_session.execute(
        select(func.count()).select_from(RatingEvent).where(RatingEvent.user_id.in_(demo_user_ids)),
    ).scalar_one()
    follow_count = db_session.execute(
        select(func.count())
        .select_from(Follow)
        .where(
            Follow.follower_id.in_(demo_user_ids) | Follow.following_id.in_(demo_user_ids),
        ),
    ).scalar_one()
    snapshot_count = db_session.execute(
        select(func.count())
        .select_from(UserSimilaritySnapshot)
        .where(
            UserSimilaritySnapshot.user_a_id.in_(demo_user_ids)
            | UserSimilaritySnapshot.user_b_id.in_(demo_user_ids),
        ),
    ).scalar_one()
    profile_count = db_session.execute(
        select(func.count()).select_from(Profile).where(Profile.user_id.in_(demo_user_ids)),
    ).scalar_one()
    return {
        "profiles": profile_count,
        "rankings": ranking_count,
        "rating_events": event_count,
        "follows": follow_count,
        "snapshots": snapshot_count,
    }
