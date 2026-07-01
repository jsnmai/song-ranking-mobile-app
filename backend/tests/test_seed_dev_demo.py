# Tests for the local dev demo seed script guards and idempotency.
from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select

from scripts.demo_seed_data import (
    COMPARISON_SPECS_BY_USERNAME,
    DEMO_ACCOUNTS,
    DEMO_EMAIL_DOMAIN,
    DEMO_PASSWORD,
    DISCO_ALREADY_RATED_DEEZER_ID,
    DISCO_BLOCKED_DEEZER_ID,
    DISCO_CO_SIGN_DEEZER_ID,
    demo_email,
    seed_email,
)
from scripts.seed_dev_demo import (
    SeedAbortedError,
    assert_required_schema,
    assert_safe_database_url,
    assert_seed_environment,
    is_legacy_demo_email,
    purge_legacy_demo_users,
    seed_demo_data,
)
from src.core.security import hash_password
from src.crud.user import create_user_with_profile
from src.sqlalchemy_tables.block import Block
from src.sqlalchemy_tables.bookmark import Bookmark
from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.notification import Notification
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
    """Demo emails must use a memorable domain accepted by email validation."""
    assert DEMO_EMAIL_DOMAIN == "@listn.demo"
    for account in DEMO_ACCOUNTS:
        assert account.email.endswith(DEMO_EMAIL_DOMAIN)
        # Seed accounts use seed_email (strips seed_ prefix); all others use demo_email.
        if account.username.startswith("seed_"):
            assert account.email == seed_email(account.username)
        else:
            assert account.email == demo_email(account.username)
        assert not account.email.startswith("demo_")
        assert not account.email.startswith("seed_")


def test_demo_accounts_cover_visibility_states() -> None:
    """Seeded accounts cover public, friends-only, and only-me manual testing."""
    visibility_by_username = {account.username: account.visibility for account in DEMO_ACCOUNTS}

    assert visibility_by_username["demo_power"] == "public"
    assert visibility_by_username["demo_friends_only"] == "friends_only"
    assert visibility_by_username["demo_private"] == "only_me"


def test_is_legacy_demo_email_only_matches_known_demo_usernames() -> None:
    """Legacy cleanup is scoped to seeded demo usernames on @listn.test."""
    assert is_legacy_demo_email("demo_power@listn.test") is True
    assert is_legacy_demo_email("power@listn.test") is True
    assert is_legacy_demo_email("power@listn.dev") is True
    assert is_legacy_demo_email("power@listn.demo") is False
    assert is_legacy_demo_email("power@demo.listn.dev") is True
    assert is_legacy_demo_email("power@li.test") is True
    assert is_legacy_demo_email("other_user@listn.test") is False


def test_purge_legacy_demo_users_removes_listn_test_demo_only(
    db_session,
) -> None:
    """Legacy @listn.test demo rows are removed without touching current-domain demos."""
    legacy = create_user_with_profile(
        db_session,
        email="demo_power@listn.test",
        hashed_password=hash_password(DEMO_PASSWORD),
        username="legacy_demo_power",
        display_name="Legacy Demo Power",
        age_verified_13_plus=True,
        age_verified_at=datetime.now(timezone.utc),
        age_gate_version="test-13-plus-v1",
    )
    current = create_user_with_profile(
        db_session,
        email=demo_email("demo_power"),
        hashed_password=hash_password(DEMO_PASSWORD),
        username="demo_power",
        display_name="Demo Power",
        age_verified_13_plus=True,
        age_verified_at=datetime.now(timezone.utc),
        age_gate_version="test-13-plus-v1",
    )
    outsider = create_user_with_profile(
        db_session,
        email="other_user@listn.test",
        hashed_password=hash_password(DEMO_PASSWORD),
        username="other_user_test",
        display_name="Other User",
        age_verified_13_plus=True,
        age_verified_at=datetime.now(timezone.utc),
        age_gate_version="test-13-plus-v1",
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


def test_assert_required_schema_accepts_migrated_test_db(db_session) -> None:
    """Seed preflight accepts the migrated test schema."""
    assert_required_schema(db_session)


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
    friends_only_id = first.user_ids_by_username["demo_friends_only"]
    blocked_id = first.user_ids_by_username["demo_blocked"]
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

    profiles = db_session.execute(
        select(Profile).where(Profile.user_id.in_(demo_user_ids)),
    ).scalars()
    visibility_by_username = {profile.username: profile.visibility for profile in profiles}
    for account in DEMO_ACCOUNTS:
        assert visibility_by_username[account.username] == account.visibility

    friends_only_profile = db_session.get(Profile, friends_only_id)
    blocked_edges = db_session.execute(
        select(func.count())
        .select_from(Block)
        .where(Block.blocker_id == power_id, Block.blocked_id == blocked_id),
    ).scalar_one()
    assert friends_only_profile is not None
    assert friends_only_profile.visibility == "friends_only"
    assert blocked_edges == 1
    power_comparisons = db_session.execute(
        select(Comparison)
        .where(Comparison.user_id == power_id)
        .order_by(
            Comparison.finalized_at.desc(),
            Comparison.comparison_index_in_session,
        ),
    ).scalars().all()
    assert len(power_comparisons) == len(COMPARISON_SPECS_BY_USERNAME["demo_power"])
    assert all(comparison.finalized_at is not None for comparison in power_comparisons)
    assert {comparison.bucket for comparison in power_comparisons} == {"like", "alright", "dislike"}
    assert any(comparison.decision_duration_ms is None for comparison in power_comparisons)
    assert any(comparison.decision_duration_ms is not None for comparison in power_comparisons)

    # demo_power has in-app notifications to view: both follows and likes, with some unread.
    power_notifications = db_session.execute(
        select(Notification).where(Notification.recipient_id == power_id),
    ).scalars().all()
    assert {n.type for n in power_notifications} == {"follow", "like"}
    assert any(n.read_at is None for n in power_notifications)
    assert any(n.read_at is not None for n in power_notifications)
    # Every like notification points at one of demo_power's own rating events.
    like_notifications = [n for n in power_notifications if n.type == "like"]
    assert like_notifications
    assert all(n.rating_event_id is not None for n in like_notifications)
    power_event_ids = set(
        db_session.execute(
            select(RatingEvent.id).where(RatingEvent.user_id == power_id),
        ).scalars(),
    )
    assert all(n.rating_event_id in power_event_ids for n in like_notifications)


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
    comparison_count = db_session.execute(
        select(func.count()).select_from(Comparison).where(Comparison.user_id.in_(demo_user_ids)),
    ).scalar_one()
    follow_count = db_session.execute(
        select(func.count())
        .select_from(Follow)
        .where(
            Follow.follower_id.in_(demo_user_ids) | Follow.following_id.in_(demo_user_ids),
        ),
    ).scalar_one()
    block_count = db_session.execute(
        select(func.count())
        .select_from(Block)
        .where(
            Block.blocker_id.in_(demo_user_ids) | Block.blocked_id.in_(demo_user_ids),
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
    bookmark_count = db_session.execute(
        select(func.count()).select_from(Bookmark).where(Bookmark.user_id.in_(demo_user_ids)),
    ).scalar_one()
    notification_count = db_session.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.recipient_id.in_(demo_user_ids) | Notification.actor_id.in_(demo_user_ids),
        ),
    ).scalar_one()
    return {
        "profiles": profile_count,
        "rankings": ranking_count,
        "rating_events": event_count,
        "comparisons": comparison_count,
        "follows": follow_count,
        "blocks": block_count,
        "snapshots": snapshot_count,
        "bookmarks": bookmark_count,
        "notifications": notification_count,
    }


def _run_seed(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, int]:
    """Seed demo data in the test DB and return username → user_id."""
    monkeypatch.setenv("ALLOW_DEV_SEED", "1")
    monkeypatch.setattr("scripts.seed_dev_demo.settings.database_url", TEST_DATABASE_URL)
    result = seed_demo_data(db_session)
    db_session.commit()
    return result.user_ids_by_username


def _login(client, email: str) -> str:
    """Log in a demo account and return its access token."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": DEMO_PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_discovery_seed_co_sign_present(
    client,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """demo_power sees at least one Co-Sign card after seeding."""
    _run_seed(db_session, monkeypatch)
    token = _login(client, demo_email("demo_power"))

    body = client.get(
        "/api/v1/discover/co-signs",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    titles = [item["song"]["deezer_id"] for item in body["items"]]
    assert DISCO_CO_SIGN_DEEZER_ID in titles
    co_sign_item = next(item for item in body["items"] if item["song"]["deezer_id"] == DISCO_CO_SIGN_DEEZER_ID)
    assert co_sign_item["co_sign_count"] == 2
    contributor_usernames = {c["username"] for c in co_sign_item["contributors"]}
    assert contributor_usernames == {"demo_disc_a", "demo_disc_b"}


def test_discovery_seed_blocked_user_song_excluded(
    client,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """demo_blocked's high-scored song does not appear in demo_power's discovery."""
    _run_seed(db_session, monkeypatch)
    token = _login(client, demo_email("demo_power"))

    co_sign_ids = {
        item["song"]["deezer_id"]
        for item in client.get(
            "/api/v1/discover/co-signs",
            headers={"Authorization": f"Bearer {token}"},
        ).json()["items"]
    }

    assert DISCO_BLOCKED_DEEZER_ID not in co_sign_ids


def test_discovery_seed_already_rated_excluded(
    client,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Songs demo_power has already rated never appear in discovery even when friends score them 9+."""
    _run_seed(db_session, monkeypatch)
    token = _login(client, demo_email("demo_power"))

    co_sign_ids = {
        item["song"]["deezer_id"]
        for item in client.get(
            "/api/v1/discover/co-signs",
            headers={"Authorization": f"Bearer {token}"},
        ).json()["items"]
    }

    assert DISCO_ALREADY_RATED_DEEZER_ID not in co_sign_ids


def test_discovery_seed_bookmarked_state_present(
    client,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """demo_power's pre-seeded bookmarked co-sign song reports is_bookmarked=True."""
    _run_seed(db_session, monkeypatch)
    token = _login(client, demo_email("demo_power"))

    items = client.get(
        "/api/v1/discover/co-signs",
        headers={"Authorization": f"Bearer {token}"},
    ).json()["items"]

    bookmarked_item = next(
        (item for item in items if item["song"]["deezer_id"] == DISCO_CO_SIGN_DEEZER_ID),
        None,
    )
    assert bookmarked_item is not None
    assert bookmarked_item["is_bookmarked"] is True


def test_seed_streaks_visible_on_own_and_other_profiles(
    client,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Seeded streaks show on demo_power's own profile and on public demo_friend's profile."""
    _run_seed(db_session, monkeypatch)
    token = _login(client, demo_email("demo_power"))
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/v1/profile/me", headers=headers).json()
    assert me["user_stats"]["current_streak"] == 7
    assert me["user_stats"]["longest_streak"] == 12

    friend = client.get("/api/v1/profile/demo_friend", headers=headers).json()
    assert friend["user_stats"]["current_streak"] == 4


def test_discovery_seed_is_idempotent(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two seed passes produce identical discovery row counts."""
    monkeypatch.setenv("ALLOW_DEV_SEED", "1")
    monkeypatch.setattr("scripts.seed_dev_demo.settings.database_url", TEST_DATABASE_URL)

    seed_demo_data(db_session)
    db_session.commit()

    demo_emails = [account.email for account in DEMO_ACCOUNTS]
    demo_user_ids = list(
        db_session.execute(
            select(User.id).where(User.email.in_(demo_emails)),
        ).scalars(),
    )
    counts_first = _demo_counts(db_session, demo_user_ids)

    seed_demo_data(db_session)
    db_session.commit()

    counts_second = _demo_counts(db_session, demo_user_ids)
    assert counts_first == counts_second
    assert counts_first["bookmarks"] == 1
