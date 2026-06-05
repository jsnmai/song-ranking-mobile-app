# Tests for GET /api/v1/profile/{username}/compatibility — Phase 12 read endpoint.
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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
    similarity_score: float = 0.78,
    shared_song_count: int = 5,
    shared_genres: list[str] | None = None,
    shared_top_artists: list[str] | None = None,
) -> None:
    """Insert a similarity snapshot directly for test setup, respecting canonical ordering."""
    a, b = min(uid_a, uid_b), max(uid_a, uid_b)
    db.add(
        UserSimilaritySnapshot(
            user_a_id=a,
            user_b_id=b,
            similarity_score=similarity_score,
            shared_song_count=shared_song_count,
            score_distance_avg=1.5,
            shared_genres=shared_genres if shared_genres is not None else ["Rock"],
            shared_top_artists=shared_top_artists if shared_top_artists is not None else ["Frank Ocean"],
            algorithm_version="v1_cosine",
        )
    )
    db.commit()


def _make_private(
    db: Session,
    user_id: int,
) -> None:
    """Set a user's profile to private via the test database."""
    profile = db.query(Profile).filter(Profile.user_id == user_id).one()
    profile.is_public = False
    profile.visibility = "only_me"
    db.commit()


# ---------------------------------------------------------------------------
# Visibility and 404 tests
# ---------------------------------------------------------------------------


def test_target_not_found_returns_404(client: TestClient) -> None:
    """404 when the target username does not exist."""
    token, _ = _register(client, "view404@example.com", "view404")

    resp = client.get(
        "/api/v1/profile/doesnotexist/compatibility",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 404


def test_target_private_requester_not_follower_returns_404(
    client: TestClient,
    db_session: Session,
) -> None:
    """404 when the target profile is private and the requester does not follow them."""
    token_a, uid_a = _register(client, "priv_req_a@example.com", "priv_req_a")
    token_b, uid_b = _register(client, "priv_req_b@example.com", "priv_req_b")
    _make_private(db_session, uid_b)

    resp = client.get(
        "/api/v1/profile/priv_req_b/compatibility",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# No-overlap safe state
# ---------------------------------------------------------------------------


def test_no_snapshot_returns_200_with_no_overlap(client: TestClient) -> None:
    """200 with has_overlap=False and shared_song_count=0 when no snapshot exists."""
    token_a, uid_a = _register(client, "nosa@example.com", "nosa")
    _register(client, "nosb@example.com", "nosb")

    resp = client.get(
        "/api/v1/profile/nosb/compatibility",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["has_overlap"] is False
    assert data["similarity_score"] is None
    assert data["shared_song_count"] == 0
    assert "Not enough overlap" in data["explanation"]
    assert data["is_plus"] is False


def test_snapshot_below_5_shared_songs_returns_no_overlap(
    client: TestClient,
    db_session: Session,
) -> None:
    """200 with has_overlap=False when a snapshot row exists but shared_song_count < 5."""
    token_a, uid_a = _register(client, "sub5_a@example.com", "sub5_a")
    token_b, uid_b = _register(client, "sub5_b@example.com", "sub5_b")
    _seed_snapshot(db_session, uid_a, uid_b, similarity_score=0.9, shared_song_count=3)

    resp = client.get(
        "/api/v1/profile/sub5_b/compatibility",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["has_overlap"] is False
    assert data["similarity_score"] is None
    assert data["shared_song_count"] == 3
    assert "Not enough overlap" in data["explanation"]


# ---------------------------------------------------------------------------
# Valid snapshot
# ---------------------------------------------------------------------------


def test_valid_snapshot_returns_200_with_overlap(
    client: TestClient,
    db_session: Session,
) -> None:
    """200 with has_overlap=True and score present when a snapshot exists."""
    token_a, uid_a = _register(client, "snap_a@example.com", "snap_a")
    token_b, uid_b = _register(client, "snap_b@example.com", "snap_b")
    _seed_snapshot(db_session, uid_a, uid_b, similarity_score=0.78, shared_song_count=5)

    resp = client.get(
        "/api/v1/profile/snap_b/compatibility",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["has_overlap"] is True
    assert abs(data["similarity_score"] - 0.78) < 1e-4
    assert data["shared_song_count"] == 5
    assert data["is_plus"] is False


# ---------------------------------------------------------------------------
# Explanation phrase rules
# ---------------------------------------------------------------------------


def test_explanation_uses_artist_first(
    client: TestClient,
    db_session: Session,
) -> None:
    """Explanation uses shared_top_artists[0] when available."""
    token_a, uid_a = _register(client, "exp_a@example.com", "exp_a")
    token_b, uid_b = _register(client, "exp_b@example.com", "exp_b")
    _seed_snapshot(
        db_session,
        uid_a,
        uid_b,
        shared_top_artists=["Kendrick Lamar"],
        shared_genres=["Hip-Hop"],
    )

    resp = client.get(
        "/api/v1/profile/exp_b/compatibility",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 200
    explanation = resp.json()["explanation"]
    assert "Both love" in explanation
    assert "Kendrick Lamar" in explanation


def test_explanation_uses_genre_when_no_artists(
    client: TestClient,
    db_session: Session,
) -> None:
    """Explanation falls back to shared_genres[0] when no shared_top_artists."""
    token_a, uid_a = _register(client, "gen_a@example.com", "gen_a")
    token_b, uid_b = _register(client, "gen_b@example.com", "gen_b")
    _seed_snapshot(
        db_session,
        uid_a,
        uid_b,
        shared_top_artists=[],
        shared_genres=["Jazz"],
    )

    resp = client.get(
        "/api/v1/profile/gen_b/compatibility",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 200
    explanation = resp.json()["explanation"]
    assert "Jazz" in explanation
    assert "rate" in explanation


def test_explanation_falls_back_to_song_count(
    client: TestClient,
    db_session: Session,
) -> None:
    """Explanation falls back to shared_song_count when no artists or genres."""
    token_a, uid_a = _register(client, "cnt_a@example.com", "cnt_a")
    token_b, uid_b = _register(client, "cnt_b@example.com", "cnt_b")
    _seed_snapshot(
        db_session,
        uid_a,
        uid_b,
        shared_top_artists=[],
        shared_genres=[],
        shared_song_count=7,
    )

    resp = client.get(
        "/api/v1/profile/cnt_b/compatibility",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 200
    explanation = resp.json()["explanation"]
    assert "7" in explanation
    assert "agree" in explanation


# ---------------------------------------------------------------------------
# is_plus wiring
# ---------------------------------------------------------------------------


def test_endpoint_calls_is_plus(
    client: TestClient,
    monkeypatch,
) -> None:
    """is_plus is called by the endpoint even though it returns False at launch."""
    calls: list[int] = []

    def mock_is_plus(user) -> bool:
        calls.append(user.id)
        return False

    monkeypatch.setattr("src.services.profile.check_is_plus", mock_is_plus)

    token_a, uid_a = _register(client, "plus_a@example.com", "plus_a")
    _register(client, "plus_b@example.com", "plus_b")

    client.get(
        "/api/v1/profile/plus_b/compatibility",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert uid_a in calls


# ---------------------------------------------------------------------------
# Canonical ordering
# ---------------------------------------------------------------------------


def test_canonical_ordering_snapshot_found_from_either_side(
    client: TestClient,
    db_session: Session,
) -> None:
    """Snapshot lookup works regardless of which user sends the request."""
    # Register B first so uid_b < uid_a — snapshot stored with uid_b as user_a_id.
    token_b, uid_b = _register(client, "cord_b@example.com", "cord_b")
    token_a, uid_a = _register(client, "cord_a@example.com", "cord_a")
    assert uid_b < uid_a

    _seed_snapshot(db_session, uid_a, uid_b, similarity_score=0.65)

    # Request from A — uid_a is user_b_id in the stored snapshot row.
    resp = client.get(
        "/api/v1/profile/cord_b/compatibility",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["has_overlap"] is True
    assert abs(data["similarity_score"] - 0.65) < 1e-4
