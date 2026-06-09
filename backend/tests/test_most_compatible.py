# Tests for GET /api/v1/profile/me/most-compatible — Most Compatible list endpoint.
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.block import Block
from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _register(
    client: TestClient,
    email: str,
    username: str,
) -> tuple[str, int]:
    """Register a user and return (token, user_id)."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": "Test User",
            "username": username,
        },
    )
    data = response.json()
    return data["access_token"], data["user"]["id"]


def _seed_snapshot(
    db: Session,
    uid_a: int,
    uid_b: int,
    similarity_score: float = 0.80,
    shared_song_count: int = 10,
    shared_genres: list[str] | None = None,
    shared_top_artists: list[str] | None = None,
) -> None:
    """Insert a similarity snapshot, respecting canonical ordering."""
    a, b = min(uid_a, uid_b), max(uid_a, uid_b)
    db.add(
        UserSimilaritySnapshot(
            user_a_id=a,
            user_b_id=b,
            similarity_score=similarity_score,
            shared_song_count=shared_song_count,
            score_distance_avg=1.0,
            shared_genres=shared_genres if shared_genres is not None else ["Hip-Hop"],
            shared_top_artists=shared_top_artists if shared_top_artists is not None else ["Kendrick Lamar"],
            algorithm_version="v1_cosine",
        )
    )
    db.commit()


def _make_private(db: Session, user_id: int) -> None:
    """Set a user's profile to only_me."""
    profile = db.query(Profile).filter(Profile.user_id == user_id).one()
    profile.is_public = False
    profile.visibility = "only_me"
    db.commit()


def _make_friends_only(db: Session, user_id: int) -> None:
    """Set a user's profile to friends_only."""
    profile = db.query(Profile).filter(Profile.user_id == user_id).one()
    profile.is_public = False
    profile.visibility = "friends_only"
    db.commit()


def _follow(db: Session, follower_id: int, following_id: int) -> None:
    """Create a follow relationship directly."""
    db.add(Follow(follower_id=follower_id, following_id=following_id))
    db.commit()


def _block(db: Session, blocker_id: int, blocked_id: int) -> None:
    """Create a block relationship directly."""
    db.add(Block(blocker_id=blocker_id, blocked_id=blocked_id))
    db.commit()


# ---------------------------------------------------------------------------
# Basic response shape
# ---------------------------------------------------------------------------


def test_empty_list_when_no_snapshots(client: TestClient) -> None:
    """Returns empty users list when no snapshots exist for the viewer."""
    token, _ = _register(client, "mc_empty@example.com", "mc_empty")

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["users"] == []


def test_returns_compatible_user_with_correct_fields(
    client: TestClient,
    db_session: Session,
) -> None:
    """Returns a compatible user with all required response fields."""
    token_a, uid_a = _register(client, "mc_fields_a@example.com", "mc_fields_a")
    _, uid_b = _register(client, "mc_fields_b@example.com", "mc_fields_b")
    _seed_snapshot(
        db_session,
        uid_a,
        uid_b,
        similarity_score=0.87,
        shared_song_count=14,
        shared_top_artists=["Frank Ocean"],
        shared_genres=["R&B"],
    )

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 200
    users = resp.json()["users"]
    assert len(users) == 1
    u = users[0]
    assert u["username"] == "mc_fields_b"
    assert abs(u["similarity_score"] - 0.87) < 1e-4
    assert u["shared_song_count"] == 14
    assert "explanation" in u
    assert "computed_at" in u


# ---------------------------------------------------------------------------
# Sorted by score descending
# ---------------------------------------------------------------------------


def test_sorted_by_score_descending(
    client: TestClient,
    db_session: Session,
) -> None:
    """Multiple compatible users are returned in descending score order."""
    token_a, uid_a = _register(client, "mc_sort_a@example.com", "mc_sort_a")
    _, uid_b = _register(client, "mc_sort_b@example.com", "mc_sort_b")
    _, uid_c = _register(client, "mc_sort_c@example.com", "mc_sort_c")
    _seed_snapshot(db_session, uid_a, uid_b, similarity_score=0.60)
    _seed_snapshot(db_session, uid_a, uid_c, similarity_score=0.90)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 200
    users = resp.json()["users"]
    assert len(users) == 2
    assert users[0]["username"] == "mc_sort_c"
    assert users[1]["username"] == "mc_sort_b"


# ---------------------------------------------------------------------------
# Self exclusion
# ---------------------------------------------------------------------------


def test_excludes_self(
    client: TestClient,
    db_session: Session,
) -> None:
    """The viewer never appears in their own Most Compatible list."""
    token_a, uid_a = _register(client, "mc_self_a@example.com", "mc_self_a")
    _, uid_b = _register(client, "mc_self_b@example.com", "mc_self_b")
    _seed_snapshot(db_session, uid_a, uid_b)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    usernames = [u["username"] for u in resp.json()["users"]]
    assert "mc_self_a" not in usernames


# ---------------------------------------------------------------------------
# Minimum overlap gate
# ---------------------------------------------------------------------------


def test_excludes_low_overlap_snapshots(
    client: TestClient,
    db_session: Session,
) -> None:
    """Users with fewer than 5 shared songs are excluded from the list."""
    token_a, uid_a = _register(client, "mc_low_a@example.com", "mc_low_a")
    _, uid_b = _register(client, "mc_low_b@example.com", "mc_low_b")
    _seed_snapshot(db_session, uid_a, uid_b, shared_song_count=4)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.json()["users"] == []


def test_includes_exactly_5_shared_songs(
    client: TestClient,
    db_session: Session,
) -> None:
    """Exactly 5 shared songs meets the minimum overlap threshold."""
    token_a, uid_a = _register(client, "mc_five_a@example.com", "mc_five_a")
    _, uid_b = _register(client, "mc_five_b@example.com", "mc_five_b")
    _seed_snapshot(db_session, uid_a, uid_b, shared_song_count=5)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert len(resp.json()["users"]) == 1


# ---------------------------------------------------------------------------
# Block filtering
# ---------------------------------------------------------------------------


def test_excludes_user_blocked_by_viewer(
    client: TestClient,
    db_session: Session,
) -> None:
    """Users blocked by the viewer are not shown."""
    token_a, uid_a = _register(client, "mc_blk1_a@example.com", "mc_blk1_a")
    _, uid_b = _register(client, "mc_blk1_b@example.com", "mc_blk1_b")
    _seed_snapshot(db_session, uid_a, uid_b)
    _block(db_session, uid_a, uid_b)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.json()["users"] == []


def test_excludes_user_who_blocked_viewer(
    client: TestClient,
    db_session: Session,
) -> None:
    """Users who have blocked the viewer are not shown."""
    token_a, uid_a = _register(client, "mc_blk2_a@example.com", "mc_blk2_a")
    _, uid_b = _register(client, "mc_blk2_b@example.com", "mc_blk2_b")
    _seed_snapshot(db_session, uid_a, uid_b)
    _block(db_session, uid_b, uid_a)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.json()["users"] == []


# ---------------------------------------------------------------------------
# Privacy filtering
# ---------------------------------------------------------------------------


def test_excludes_private_users(
    client: TestClient,
    db_session: Session,
) -> None:
    """Users with only_me visibility are excluded."""
    token_a, uid_a = _register(client, "mc_priv_a@example.com", "mc_priv_a")
    _, uid_b = _register(client, "mc_priv_b@example.com", "mc_priv_b")
    _seed_snapshot(db_session, uid_a, uid_b)
    _make_private(db_session, uid_b)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.json()["users"] == []


def test_excludes_friends_only_without_mutual_follow(
    client: TestClient,
    db_session: Session,
) -> None:
    """friends_only profiles require mutual follow — one-way follow is insufficient."""
    token_a, uid_a = _register(client, "mc_fo_a@example.com", "mc_fo_a")
    _, uid_b = _register(client, "mc_fo_b@example.com", "mc_fo_b")
    _seed_snapshot(db_session, uid_a, uid_b)
    _make_friends_only(db_session, uid_b)
    _follow(db_session, uid_a, uid_b)  # viewer follows other, but not mutual

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.json()["users"] == []


def test_includes_friends_only_with_mutual_follow(
    client: TestClient,
    db_session: Session,
) -> None:
    """friends_only profiles are included when there is a mutual follow."""
    token_a, uid_a = _register(client, "mc_mut_a@example.com", "mc_mut_a")
    _, uid_b = _register(client, "mc_mut_b@example.com", "mc_mut_b")
    _seed_snapshot(db_session, uid_a, uid_b)
    _make_friends_only(db_session, uid_b)
    _follow(db_session, uid_a, uid_b)
    _follow(db_session, uid_b, uid_a)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    usernames = [u["username"] for u in resp.json()["users"]]
    assert "mc_mut_b" in usernames


def test_includes_public_users_without_follow(
    client: TestClient,
    db_session: Session,
) -> None:
    """Public profiles appear in the list without any follow relationship."""
    token_a, uid_a = _register(client, "mc_pub_a@example.com", "mc_pub_a")
    _, uid_b = _register(client, "mc_pub_b@example.com", "mc_pub_b")
    _seed_snapshot(db_session, uid_a, uid_b)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    usernames = [u["username"] for u in resp.json()["users"]]
    assert "mc_pub_b" in usernames


# ---------------------------------------------------------------------------
# Canonical ordering — viewer on either side of the snapshot
# ---------------------------------------------------------------------------


def test_finds_snapshot_when_viewer_is_user_b(
    client: TestClient,
    db_session: Session,
) -> None:
    """Snapshot is found when viewer_id > other_id (viewer stored as user_b_id)."""
    # Register B first so uid_b < uid_a — snapshot uses uid_b as user_a_id.
    _, uid_b = _register(client, "mc_ord_b@example.com", "mc_ord_b")
    token_a, uid_a = _register(client, "mc_ord_a@example.com", "mc_ord_a")
    assert uid_b < uid_a

    _seed_snapshot(db_session, uid_a, uid_b, similarity_score=0.72)

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    users = resp.json()["users"]
    assert len(users) == 1
    assert users[0]["username"] == "mc_ord_b"
    assert abs(users[0]["similarity_score"] - 0.72) < 1e-4


# ---------------------------------------------------------------------------
# Explanation phrase
# ---------------------------------------------------------------------------


def test_explanation_uses_artist_when_available(
    client: TestClient,
    db_session: Session,
) -> None:
    """Explanation uses shared artist name when present."""
    token_a, uid_a = _register(client, "mc_exp_a@example.com", "mc_exp_a")
    _, uid_b = _register(client, "mc_exp_b@example.com", "mc_exp_b")
    _seed_snapshot(
        db_session,
        uid_a,
        uid_b,
        shared_top_artists=["SZA"],
        shared_genres=["R&B"],
    )

    resp = client.get(
        "/api/v1/profile/me/most-compatible",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    explanation = resp.json()["users"][0]["explanation"]
    assert "SZA" in explanation
