# Integration tests for the bundled Feed modules endpoint (Re-rate Radar + Consensus live; rest reserved).
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.profile import Profile

RESERVED_MODULE_KEYS = ("disagreement_spotlight", "split_decision", "match_moment")


def _register(
    client: TestClient,
    email: str,
    username: str,
    display_name: str | None = None,
) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": display_name if display_name is not None else username.title(),
            "username": username,
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def _finalize_rating(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str,
    bucket: str = "like",
    note: str | None = None,
) -> dict:
    """Finalize a rating and return the response body."""
    payload = {
        "song": {
            "deezer_id": deezer_id,
            "isrc": "USUG11900842",
            "title": title,
            "artist": "Frank Ocean",
            "artist_deezer_id": 456,
            "album": "Blonde",
            "cover_url": "https://example.com/cover.jpg",
            "preview_url": "https://example.com/preview.mp3",
            "genre_deezer": None,
        },
        "bucket": bucket,
    }
    if note is not None:
        payload["note"] = note
    response = client.post(
        "/api/v1/ratings/finalize",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def _rerate(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str,
    first_bucket: str,
    second_bucket: str,
    note: str | None = None,
) -> None:
    """Rate a song, then re-rate the same song — producing a `rerated` event."""
    _finalize_rating(client, token, deezer_id, title, first_bucket)
    _finalize_rating(client, token, deezer_id, title, second_bucket, note=note)


def _follow(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Follow a user by username."""
    response = client.post(
        f"/api/v1/profile/{username}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _block(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Block a user by username."""
    response = client.post(
        f"/api/v1/profile/{username}/block",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _modules(
    client: TestClient,
    token: str,
) -> dict:
    """Fetch the bundled Feed modules for a viewer."""
    response = client.get(
        "/api/v1/feed/modules",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def _mutual_follow(
    client: TestClient,
    viewer_token: str,
    viewer_name: str,
    friend_token: str,
    friend_name: str,
) -> None:
    """Make viewer and friend mutual follows (a 'friend' = mutual follow)."""
    _follow(client, viewer_token, friend_name)
    _follow(client, friend_token, viewer_name)


def _friend_rates(
    client: TestClient,
    viewer_token: str,
    viewer_name: str,
    name: str,
    deezer_id: int,
    title: str,
    bucket: str = "like",
) -> str:
    """Register a friend (mutual follow with the viewer) who rates one song. Returns their token."""
    token = _register(client, f"{name}@example.com", name)
    _mutual_follow(client, viewer_token, viewer_name, token, name)
    _finalize_rating(client, token, deezer_id, title, bucket)
    return token


def test_feed_modules_requires_auth(client: TestClient):
    """The Feed modules endpoint is account-only."""
    response = client.get("/api/v1/feed/modules")

    assert response.status_code == 401


def test_feed_modules_empty_returns_null_modules(client: TestClient):
    """With no qualifying data every module is null — including the reserved keys."""
    token = _register(client, "viewer@example.com", "viewer")

    body = _modules(client, token)

    assert body["rerate_radar"] is None
    assert body["consensus"] is None
    for key in RESERVED_MODULE_KEYS:
        assert body[key] is None


def test_rerate_radar_surfaces_followed_rerate_delta(client: TestClient):
    """A followed user's re-rate surfaces with its previous->new delta."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed", "Followed User")
    _follow(client, viewer, "followed")
    _rerate(client, followed, 101, "Moved Song", "like", "dislike")

    body = _modules(client, viewer)

    radar = body["rerate_radar"]
    assert radar is not None
    assert radar["actor_profile"]["username"] == "followed"
    assert radar["song"]["title"] == "Moved Song"
    assert radar["previous_bucket"] == "like"
    assert radar["new_bucket"] == "dislike"
    assert radar["previous_score"] == 8.75
    assert radar["new_score"] != radar["previous_score"]
    # The reserved modules stay null even once one module has data.
    for key in RESERVED_MODULE_KEYS:
        assert body[key] is None


def test_rerate_radar_ignores_plain_first_rating(client: TestClient):
    """A first-time rating (event_type `rated`) is not a re-rate and never appears."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    _finalize_rating(client, followed, 101, "First Rating Song", "like")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_ignores_unchanged_score(client: TestClient):
    """Re-rating to the same bucket/score is not a movement, so it is excluded."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    # The song is the only one in "like", so re-rating like->like keeps the same score.
    _rerate(client, followed, 101, "Unmoved Song", "like", "like")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_excludes_non_followed_user(client: TestClient):
    """A stranger's re-rate is not in the viewer's radar (friends only)."""
    viewer = _register(client, "viewer@example.com", "viewer")
    stranger = _register(client, "stranger@example.com", "stranger")
    _rerate(client, stranger, 101, "Stranger Song", "like", "dislike")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_excludes_own_rerate(client: TestClient):
    """Re-rate Radar is about *friends* — the viewer's own re-rates never appear."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _rerate(client, viewer, 101, "My Own Song", "like", "dislike")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_returns_only_latest(client: TestClient):
    """When a followed user re-rates several songs, only the newest re-rate shows."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    # Each song moves into an empty bucket so neither re-rate needs a contested-bucket position.
    _rerate(client, followed, 101, "Older Re-rate", "like", "dislike")
    _rerate(client, followed, 202, "Newer Re-rate", "like", "alright")

    radar = _modules(client, viewer)["rerate_radar"]
    assert radar is not None
    assert radar["song"]["title"] == "Newer Re-rate"


def test_rerate_radar_excludes_blocked_user(client: TestClient):
    """A followed user the viewer blocks drops out of the radar."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    _rerate(client, followed, 101, "Blocked Re-rate", "like", "dislike")
    assert _modules(client, viewer)["rerate_radar"] is not None

    _block(client, viewer, "followed")

    assert _modules(client, viewer)["rerate_radar"] is None


def test_rerate_radar_excludes_private_profile(client: TestClient, db_session: Session):
    """A followed user whose taste turns private drops out of the radar."""
    viewer = _register(client, "viewer@example.com", "viewer")
    followed = _register(client, "followed@example.com", "followed")
    _follow(client, viewer, "followed")
    _rerate(client, followed, 101, "Private Re-rate", "like", "dislike")
    assert _modules(client, viewer)["rerate_radar"] is not None

    profile = db_session.execute(
        select(Profile).where(Profile.username == "followed")
    ).scalar_one()
    profile.is_public = False
    profile.visibility = "only_me"
    db_session.commit()

    assert _modules(client, viewer)["rerate_radar"] is None


# ── Consensus ────────────────────────────────────────────────────────────────


def test_consensus_null_without_enough_friend_raters(client: TestClient):
    """Consensus needs >= 3 friend raters on a song; 2 is not enough."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _friend_rates(client, viewer, "viewer", "frienda", 101, "Two Raters", "like")
    _friend_rates(client, viewer, "viewer", "friendb", 101, "Two Raters", "like")

    assert _modules(client, viewer)["consensus"] is None


def test_consensus_surfaces_with_three_friends(client: TestClient):
    """Three mutual friends rating a song yield the circle average, count, and a 10-bin histogram."""
    viewer = _register(client, "viewer@example.com", "viewer")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Agreed Song", "like")

    consensus = _modules(client, viewer)["consensus"]
    assert consensus is not None
    assert consensus["song"]["title"] == "Agreed Song"
    assert consensus["contributor_count"] == 3
    assert consensus["average_score"] == 8.75
    assert len(consensus["distribution"]) == 10
    assert sum(consensus["distribution"]) == 3
    assert consensus["distribution"][8] == 3  # all three landed in [8,9)


def test_consensus_excludes_viewer_from_aggregate(client: TestClient):
    """The viewer's own rating never counts toward the friend average, count, or distribution."""
    viewer = _register(client, "viewer@example.com", "viewer")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Agreed Song", "like")
    # Viewer rates the same song very differently — must not move the friend aggregate.
    _finalize_rating(client, viewer, 101, "Agreed Song", "dislike")

    consensus = _modules(client, viewer)["consensus"]
    assert consensus is not None
    assert consensus["contributor_count"] == 3          # not 4
    assert consensus["average_score"] == 8.75           # viewer's dislike excluded
    assert sum(consensus["distribution"]) == 3
    assert consensus["distribution"][1] == 0            # viewer's dislike not binned


def test_consensus_excludes_one_way_follow(client: TestClient):
    """A one-way-followed user who rates the song is not a friend and is not counted."""
    viewer = _register(client, "viewer@example.com", "viewer")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Agreed Song", "like")
    # One-way: viewer follows them, they do NOT follow back.
    oneway = _register(client, "oneway@example.com", "oneway")
    _follow(client, viewer, "oneway")
    _finalize_rating(client, oneway, 101, "Agreed Song", "like")

    consensus = _modules(client, viewer)["consensus"]
    assert consensus is not None
    assert consensus["contributor_count"] == 3          # one-way rater excluded


def test_consensus_drops_blocked_friend_below_threshold(client: TestClient):
    """Blocking a friend removes them from the circle; falling under 3 hides Consensus."""
    viewer = _register(client, "viewer@example.com", "viewer")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Agreed Song", "like")
    assert _modules(client, viewer)["consensus"] is not None

    _block(client, viewer, "friendc")

    assert _modules(client, viewer)["consensus"] is None


def test_consensus_excludes_private_taste_friend(client: TestClient, db_session: Session):
    """A mutual friend whose taste turns private is dropped from the aggregate (privacy regression)."""
    viewer = _register(client, "viewer@example.com", "viewer")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Agreed Song", "like")
    assert _modules(client, viewer)["consensus"] is not None

    # friendc hides their taste — even as a mutual follow, they must leave the circle aggregate.
    profile = db_session.execute(
        select(Profile).where(Profile.username == "friendc")
    ).scalar_one()
    profile.is_public = False
    profile.visibility = "only_me"
    db_session.commit()

    assert _modules(client, viewer)["consensus"] is None


def test_consensus_prefers_tighter_agreement(client: TestClient):
    """When recency/relevance are comparable, the song the circle agrees on most wins.

    Three friends rate both songs: the Tight Song everyone puts in "like" (identical scores), the
    Polarized Song they spread across buckets. Each friend's two songs are in different buckets, so
    no rating hits the non-empty-bucket position flow. Stays within the 5/min register limit.
    """
    viewer = _register(client, "viewer@example.com", "viewer")
    # Tight Song (201) → everyone "like" (sole like each ⇒ identical 8.75 ⇒ std-dev 0).
    # Polarized Song (202) → spread across dislike/alright so the distribution is wide.
    t1 = _friend_rates(client, viewer, "viewer", "frienda", 201, "Tight Song", "like")
    _finalize_rating(client, t1, 202, "Polarized Song", "dislike")
    t2 = _friend_rates(client, viewer, "viewer", "friendb", 201, "Tight Song", "like")
    _finalize_rating(client, t2, 202, "Polarized Song", "alright")
    t3 = _friend_rates(client, viewer, "viewer", "friendc", 201, "Tight Song", "like")
    _finalize_rating(client, t3, 202, "Polarized Song", "dislike")

    consensus = _modules(client, viewer)["consensus"]
    assert consensus is not None
    assert consensus["song"]["title"] == "Tight Song"


def test_consensus_is_deterministic_within_a_day(client: TestClient):
    """Two fetches the same day return the same Consensus song (stable-within-a-day pick)."""
    viewer = _register(client, "viewer@example.com", "viewer")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Agreed Song", "like")

    first = _modules(client, viewer)["consensus"]
    second = _modules(client, viewer)["consensus"]
    assert first is not None and second is not None
    assert first["song"]["id"] == second["song"]["id"]
