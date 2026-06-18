# Tests for GET /profile/me/auxstrology and GET /profile/{username}/auxstrology.
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.data.auxstrology_pools import ACTIVE_MIN_RATED, ADJECTIVE_POOLS, AXES, SIGNS
from src.sqlalchemy_tables.auxstrology_snapshot import AuxstrologySnapshot
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song


def _seed_rankings(
    db: Session,
    user_id: int,
    n: int,
    start_deezer_id: int,
    bucket: str = "like",
    artist: str = "Test Artist",
    score: float = 8.0,
    genre_deezer: str | None = None,
) -> None:
    """
    Insert n songs and rankings directly into the test DB.

    Bypasses the HTTP comparison flow so tests that need >= 5 ratings don't have
    to run a full comparison session for each song after the first per bucket.
    """
    for i in range(n):
        song = Song(
            deezer_id=start_deezer_id + i,
            title=f"Test Song {start_deezer_id + i}",
            artist=artist,
            artist_deezer_id=1,
            album="Test Album",
            cover_url="https://example.com/cover.jpg",
            genre_deezer=genre_deezer,
        )
        db.add(song)
        db.flush()
        db.add(
            Ranking(
                user_id=user_id,
                song_id=song.id,
                bucket=bucket,
                position=i + 1,
                score=score,
            )
        )
    db.commit()


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


def _rate(
    client: TestClient,
    token: str,
    deezer_id: int,
    artist: str,
    bucket: str,
    genre_deezer: str | None = None,
    note: str | None = None,
    title: str = "Test Song",
) -> None:
    """Finalize one rating into an empty bucket — no comparison required."""
    response = client.post(
        "/api/v1/ratings/finalize",
        json={
            "song": {
                "deezer_id": deezer_id,
                "isrc": None,
                "title": title,
                "artist": artist,
                "artist_deezer_id": 1,
                "album": "Test Album",
                "cover_url": "https://example.com/cover.jpg",
                "preview_url": None,
                "genre_deezer": genre_deezer,
            },
            "bucket": bucket,
            "note": note,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201


def _get_aux(
    client: TestClient,
    token: str,
    username: str | None = None,
):
    """Call the auxstrology endpoint for own profile or another user."""
    path = (
        f"/api/v1/profile/{username}/auxstrology"
        if username
        else "/api/v1/profile/me/auxstrology"
    )
    return client.get(
        path,
        headers={"Authorization": f"Bearer {token}"},
    )


def _set_visibility(
    client: TestClient,
    token: str,
    visibility: str,
) -> None:
    """Set one user's taste visibility."""
    response = client.put(
        "/api/v1/profile/me/visibility",
        json={"visibility": visibility},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def test_zero_ratings_is_locked(client: TestClient) -> None:
    """A user with no ratings gets the locked card, not an error."""
    token, _ = _register(client, "locked@example.com", "lockeduser")

    response = _get_aux(client, token)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "locked"
    assert data["current_ratings"] == 0
    assert data["required_ratings"] == ACTIVE_MIN_RATED
    assert data["sign"] is None
    assert data["caption"] is None


def test_below_threshold_stays_locked_with_no_sign(
    client: TestClient,
    db_session: Session,
) -> None:
    """Ranking under ACTIVE_MIN_RATED songs stays locked — no early teaser sign."""
    token, user_id = _register(client, "first@example.com", "firstuser")
    _rate(client, token, 100, "Artist A", "like")
    _seed_rankings(
        db_session,
        user_id,
        n=ACTIVE_MIN_RATED - 2,
        start_deezer_id=101,
    )

    response = _get_aux(client, token)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "locked"
    assert data["current_ratings"] == ACTIVE_MIN_RATED - 1
    assert data["required_ratings"] == ACTIVE_MIN_RATED
    assert data["sign"] is None
    assert data["caption"] is None


def test_active_reading_has_sign_caption_and_evidence(
    client: TestClient,
    db_session: Session,
) -> None:
    """Five ratings unlock the full reading: sign, 3-adjective caption, evidence."""
    token, user_id = _register(client, "active@example.com", "activeuser")
    _rate(client, token, 200, "Artist A", "like", genre_deezer="Pop")
    _seed_rankings(
        db_session,
        user_id,
        n=ACTIVE_MIN_RATED - 1,
        start_deezer_id=201,
        genre_deezer="Pop",
    )

    response = _get_aux(client, token)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "active"
    assert data["current_ratings"] == ACTIVE_MIN_RATED
    assert data["required_ratings"] is None
    assert data["sign"]["name"]
    assert data["sign"]["summary"]
    assert len(data["adjectives"]) == 3
    # Caption embeds all three chosen adjectives.
    for adjective in data["adjectives"]:
        assert adjective in data["caption"]
    assert len(data["evidence"]) > 0
    assert len(data["axes"]) > 0
    for zone in data["axes"].values():
        assert zone in ("very_low", "low", "mid", "high", "very_high")


def test_reading_is_stable_across_calls(
    client: TestClient,
    db_session: Session,
) -> None:
    """Seeded selection: the same user gets the identical reading every render."""
    token, user_id = _register(client, "stable@example.com", "stableuser")
    _rate(client, token, 300, "Artist A", "like", genre_deezer="Rock")
    _seed_rankings(
        db_session,
        user_id,
        n=ACTIVE_MIN_RATED - 1,
        start_deezer_id=301,
        genre_deezer="Rock",
    )

    first = _get_aux(client, token).json()
    second = _get_aux(client, token).json()

    assert first == second


def test_all_like_user_reads_as_high_conviction(
    client: TestClient,
    db_session: Session,
) -> None:
    """Rating everything 'like' is maximally convicted — conviction zone is high."""
    token, user_id = _register(client, "conv@example.com", "convuser")
    _rate(client, token, 400, "Artist A", "like")
    _seed_rankings(
        db_session,
        user_id,
        n=ACTIVE_MIN_RATED - 1,
        start_deezer_id=401,
    )

    data = _get_aux(client, token).json()

    assert data["axes"]["conviction"] in ("high", "very_high")


def test_other_user_auxstrology_respects_visibility(client: TestClient) -> None:
    """Public profiles are readable; friends_only hides auxstrology from strangers."""
    owner_token, _ = _register(client, "owner@example.com", "owneruser")
    viewer_token, _ = _register(client, "viewer@example.com", "vieweruser")
    _rate(client, owner_token, 500, "Artist A", "like")

    public_response = _get_aux(client, viewer_token, username="owneruser")
    assert public_response.status_code == 200

    _set_visibility(client, owner_token, "friends_only")
    hidden_response = _get_aux(client, viewer_token, username="owneruser")
    assert hidden_response.status_code == 404


def test_pools_cover_every_axis_and_direction() -> None:
    """Data integrity: every axis has non-mid adjectives and both sign directions."""
    for key in AXES:
        assert key in ADJECTIVE_POOLS, f"missing adjective pool for {key}"
        for zone in ("very_low", "low", "high", "very_high"):
            assert ADJECTIVE_POOLS[key][zone], f"empty pool {key}/{zone}"
        assert key in SIGNS, f"missing signs for {key}"
        for direction in ("low", "high"):
            assert SIGNS[key][direction]["name"], f"missing sign {key}/{direction}"
            assert SIGNS[key][direction]["summary"], f"missing summary {key}/{direction}"


def test_other_user_view_does_not_persist_auxstrology_snapshot(
    client: TestClient,
    db_session: Session,
) -> None:
    """A GET on another user's reading recomputes read-only — it must not write their snapshot."""
    viewer_token, _ = _register(client, "viewer@example.com", "vieweruser")
    owner_token, owner_id = _register(client, "owner@example.com", "owneruser")
    _rate(client, owner_token, 700, "Artist A", "like")

    def _snapshot_count() -> int:
        db_session.expire_all()
        return db_session.scalar(
            select(func.count())
            .select_from(AuxstrologySnapshot)
            .where(AuxstrologySnapshot.user_id == owner_id)
        )

    assert _snapshot_count() == 0

    # Another user views the owner's reading — it succeeds but writes nothing.
    response = _get_aux(client, viewer_token, "owneruser")
    assert response.status_code == 200
    assert _snapshot_count() == 0

    # The owner viewing their own reading DOES persist a snapshot (self/background only).
    own_response = _get_aux(client, owner_token)
    assert own_response.status_code == 200
    assert _snapshot_count() == 1
