# Integration tests for the bundled Feed modules endpoint.
# Live modules: Re-rate Radar, Consensus, Disagreement Spotlight, Split Decision, Match Moment.
#
# All modules sit behind a base gate (rated >= 5 AND following >= 3). The autouse fixture below opens
# that gate (thresholds -> 0) for the per-module tests so they exercise each module's own logic; the
# gate's enforcement is covered by the dedicated `test_feed_modules_gate_*` tests, which set the real
# thresholds. (We don't rate several songs per test because the rating API requires a completed
# comparison session to put more than one song in a bucket — impractical for a unit test.)
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.interaction_event import InteractionEvent
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song


@pytest.fixture(autouse=True)
def _open_module_gate(monkeypatch):
    """Open the base module gate so per-module tests reach the module logic.

    Gate enforcement is verified separately by the `test_feed_modules_gate_*` tests, which override
    these thresholds back to real values.
    """
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_RATED", 0)
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_FOLLOWING", 0)


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


def _user_id(
    db_session: Session,
    username: str,
) -> int:
    """Return a registered user's id by username."""
    return db_session.execute(
        select(Profile.user_id).where(Profile.username == username)
    ).scalar_one()


def _seed_ranked_song(
    db_session: Session,
    user_id: int,
    deezer_id: int,
    title: str,
    bucket: str,
    position: int,
    score: float,
) -> Song:
    """Seed a current ranking directly for module tests that need many rated songs."""
    song = Song(
        deezer_id=deezer_id,
        isrc=None,
        title=title,
        artist="Seed Artist",
        artist_deezer_id=deezer_id,
        album="Seed Album",
        cover_url="https://example.com/cover.jpg",
        preview_url=None,
        genre_deezer=None,
        global_rating_sum=score,
        global_avg_score=score,
        global_rating_count=1,
    )
    db_session.add(song)
    db_session.flush()
    db_session.add(
        Ranking(
            user_id=user_id,
            song_id=song.id,
            bucket=bucket,
            position=position,
            score=score,
        )
    )
    db_session.flush()
    return song


def _seed_this_or_that_rankings(
    db_session: Session,
    user_id: int,
) -> tuple[Song, Song]:
    """Seed ten ratings with one direct-neighbor pair in Like."""
    left = _seed_ranked_song(db_session, user_id, 9_101, "Higher Neighbor", "like", 1, 10.0)
    right = _seed_ranked_song(db_session, user_id, 9_102, "Lower Neighbor", "like", 2, 7.5)
    for index in range(3, 11):
        _seed_ranked_song(
            db_session,
            user_id,
            9_100 + index,
            f"Other {index}",
            "alright" if index < 7 else "dislike",
            index - 2 if index < 7 else index - 6,
            6.0 if index < 7 else 2.0,
        )
    db_session.commit()
    return left, right


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

    assert body["this_or_that"] is None
    assert body["rerate_radar"] is None
    assert body["consensus"] is None
    assert body["disagreement_spotlight"] is None
    assert body["split_decision"] is None
    assert body["match_moment"] is None


def test_feed_modules_gate_blocks_below_rated(client: TestClient, monkeypatch):
    """Real gate: under the rated threshold, every module is null even with qualifying friend data."""
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_RATED", 10)
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_FOLLOWING", 3)
    viewer = _register(client, "viewer@example.com", "viewer")
    # Follows 3 people who clearly diverge on a song — would feed Split/Consensus if gated in.
    for name, bucket in (("alpha", "like"), ("bravo", "dislike"), ("charlie", "dislike")):
        token = _register(client, f"{name}@example.com", name)
        _follow(client, viewer, name)
        _finalize_rating(client, token, 101, "Split Song", bucket)
    # following = 3, but the viewer has rated 0 (< 10) → gate blocks everything.

    body = _modules(client, viewer)
    assert body["this_or_that"] is None
    assert body["rerate_radar"] is None
    assert body["consensus"] is None
    assert body["disagreement_spotlight"] is None
    assert body["split_decision"] is None


def test_feed_modules_gate_blocks_below_following(client: TestClient, monkeypatch):
    """Real gate: meeting rated but not the following threshold still blocks everything."""
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_RATED", 0)
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_FOLLOWING", 3)
    viewer = _register(client, "viewer@example.com", "viewer")
    for name, bucket in (("alpha", "like"), ("bravo", "dislike")):
        token = _register(client, f"{name}@example.com", name)
        _follow(client, viewer, name)
        _finalize_rating(client, token, 101, "Split Song", bucket)
    # following = 2 (< 3) → gate blocks even though a split pair exists.

    assert _modules(client, viewer)["split_decision"] is None
    assert _modules(client, viewer)["consensus"] is None


def test_this_or_that_surfaces_adjacent_pair_without_social_gate(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Personal refinement can appear before the friend-gated social modules unlock."""
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_RATED", 5)
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_FOLLOWING", 3)
    monkeypatch.setattr("src.services.feed.THIS_OR_THAT_MIN_RATED", 10)
    token = _register(client, "tot@example.com", "totuser")
    user_id = _user_id(db_session, "totuser")
    left, right = _seed_this_or_that_rankings(db_session, user_id)

    body = _modules(client, token)

    prompt = body["this_or_that"]
    assert prompt is not None
    assert prompt["bucket"] == "like"
    assert prompt["left"]["song"]["id"] == left.id
    assert prompt["right"]["song"]["id"] == right.id
    assert prompt["left"]["position"] == 1
    assert prompt["right"]["position"] == 2
    assert body["rerate_radar"] is None


def test_this_or_that_choice_swaps_when_lower_neighbor_wins(
    client: TestClient,
    db_session: Session,
):
    """Choosing the lower-ranked neighbor writes a comparison receipt and swaps the pair."""
    token = _register(client, "swap@example.com", "swapuser")
    user_id = _user_id(db_session, "swapuser")
    left, right = _seed_this_or_that_rankings(db_session, user_id)

    response = client.post(
        "/api/v1/feed/this-or-that/choice",
        json={
            "left_song_id": left.id,
            "right_song_id": right.id,
            "winner_song_id": right.id,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["swapped"] is True
    comparison = db_session.execute(
        select(Comparison).where(Comparison.user_id == user_id)
    ).scalar_one()
    assert comparison.song_a_id == left.id
    assert comparison.song_b_id == right.id
    assert comparison.winner_id == right.id
    assert comparison.decision_duration_ms is None
    winner_ranking = db_session.execute(
        select(Ranking).where(Ranking.user_id == user_id, Ranking.song_id == right.id)
    ).scalar_one()
    loser_ranking = db_session.execute(
        select(Ranking).where(Ranking.user_id == user_id, Ranking.song_id == left.id)
    ).scalar_one()
    assert winner_ranking.position == 1
    assert loser_ranking.position == 2
    event = db_session.execute(
        select(InteractionEvent).where(InteractionEvent.user_id == user_id)
    ).scalar_one()
    assert event.event_type == "this_or_that_chosen"
    assert event.context["prompt_type"] == "direct_neighbor"
    assert event.context["rank_distance"] == 1
    assert event.context["score_gap"] == 2.5
    assert event.context["swapped"] is True


def test_this_or_that_choice_keeps_order_when_higher_neighbor_wins(
    client: TestClient,
    db_session: Session,
):
    """Confirming the higher-ranked neighbor records the comparison without mutating order."""
    token = _register(client, "confirm@example.com", "confirmuser")
    user_id = _user_id(db_session, "confirmuser")
    left, right = _seed_this_or_that_rankings(db_session, user_id)

    response = client.post(
        "/api/v1/feed/this-or-that/choice",
        json={
            "left_song_id": left.id,
            "right_song_id": right.id,
            "winner_song_id": left.id,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["swapped"] is False
    left_ranking = db_session.execute(
        select(Ranking).where(Ranking.user_id == user_id, Ranking.song_id == left.id)
    ).scalar_one()
    right_ranking = db_session.execute(
        select(Ranking).where(Ranking.user_id == user_id, Ranking.song_id == right.id)
    ).scalar_one()
    assert left_ranking.position == 1
    assert right_ranking.position == 2
    comparison = db_session.execute(
        select(Comparison).where(Comparison.user_id == user_id)
    ).scalar_one()
    assert comparison.winner_id == left.id


def test_this_or_that_dismiss_records_explicit_context_and_cools_down(
    client: TestClient,
    db_session: Session,
):
    """Dismiss is an explicit signal and suppresses the prompt for the cooldown window."""
    token = _register(client, "dismiss@example.com", "dismissuser")
    user_id = _user_id(db_session, "dismissuser")
    left, right = _seed_this_or_that_rankings(db_session, user_id)
    assert _modules(client, token)["this_or_that"] is not None

    response = client.post(
        "/api/v1/feed/this-or-that/dismiss",
        json={
            "left_song_id": left.id,
            "right_song_id": right.id,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"dismissed": True}
    event = db_session.execute(
        select(InteractionEvent).where(InteractionEvent.user_id == user_id)
    ).scalar_one()
    assert event.event_type == "this_or_that_dismissed"
    assert event.context["left_song_id"] == left.id
    assert event.context["right_song_id"] == right.id
    assert event.context["rank_distance"] == 1
    assert _modules(client, token)["this_or_that"] is None


def test_feed_modules_gate_opens_when_met(client: TestClient, monkeypatch):
    """Real gate: once the thresholds are met, live module data flows again."""
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_RATED", 0)
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_FOLLOWING", 2)
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_rates(client, viewer, "viewer", "alpha", 101, "Split Song", "like")
    _followed_rates(client, viewer, "viewer", "bravo", 101, "Split Song", "dislike")
    # following = 2 meets the threshold → the split surfaces.

    assert _modules(client, viewer)["split_decision"] is not None


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
    # Match Moment has no comparison data here, so it stays null even once another module fills.
    assert body["match_moment"] is None


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
    assert consensus["low_score"] == 8.75   # all three identical → spread bar's endpoints coincide
    assert consensus["high_score"] == 8.75


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


# ── Disagreement Spotlight ───────────────────────────────────────────────────


def test_disagreement_null_without_qualifying_song(client: TestClient):
    """No song the viewer rated has ≥3 friends + a big enough gap → locked."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 101, "Lonely Song", "like")
    # Only two friends rate it (below the threshold), so there's no friend crowd to diverge from.
    _friend_rates(client, viewer, "viewer", "frienda", 101, "Lonely Song", "dislike")
    _friend_rates(client, viewer, "viewer", "friendb", 101, "Lonely Song", "dislike")

    assert _modules(client, viewer)["disagreement_spotlight"] is None


def test_disagreement_surfaces_you_vs_friends_gap(client: TestClient):
    """The viewer rated a song high while ≥3 friends rated it low → a spotlighted gap."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 101, "Split Song", "like")  # you: 8.75
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Split Song", "dislike")

    d = _modules(client, viewer)["disagreement_spotlight"]
    assert d is not None
    assert d["song"]["title"] == "Split Song"
    assert d["your_score"] == 8.75
    assert d["friends_count"] == 3                    # the viewer is not counted among friends
    assert d["your_score"] > d["friends_average"]     # friends rated it lower
    assert d["gap"] >= 2.0
    assert d["direction"] == "viewer_higher"


def test_disagreement_requires_viewer_to_have_rated(client: TestClient):
    """Friends rating a song the viewer hasn't rated is not a 'you vs friends' moment."""
    viewer = _register(client, "viewer@example.com", "viewer")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Unrated By You", "dislike")

    assert _modules(client, viewer)["disagreement_spotlight"] is None


def test_disagreement_below_threshold_is_hidden(client: TestClient):
    """A song the viewer and friends roughly agree on (gap < threshold) is not a spotlight."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 101, "Agreed Song", "like")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Agreed Song", "like")  # all ~8.75 → gap ~0

    assert _modules(client, viewer)["disagreement_spotlight"] is None


def test_disagreement_picks_biggest_gap_even_when_another_is_more_recent(client: TestClient):
    """Gap is primary: the biggest-gap song wins even if a smaller-gap song was rated more recently."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 101, "Big Gap Song", "like")       # you: 8.75
    _finalize_rating(client, viewer, 202, "Small Gap Song", "dislike")  # you: low
    # Each friend rates the big-gap song first, then the small-gap song (so small-gap is more recent).
    for name in ("frienda", "friendb", "friendc"):
        token = _friend_rates(client, viewer, "viewer", name, 101, "Big Gap Song", "dislike")
        _finalize_rating(client, token, 202, "Small Gap Song", "alright")

    d = _modules(client, viewer)["disagreement_spotlight"]
    assert d is not None
    # Big Gap (you 8.75 vs friends ~dislike) beats Small Gap (you ~dislike vs friends ~alright).
    assert d["song"]["title"] == "Big Gap Song"


def test_disagreement_excludes_one_way_follow(client: TestClient):
    """A one-way-followed rater is not a friend; dropping below 3 hides the spotlight."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 101, "Split Song", "like")
    _friend_rates(client, viewer, "viewer", "frienda", 101, "Split Song", "dislike")
    _friend_rates(client, viewer, "viewer", "friendb", 101, "Split Song", "dislike")
    # One-way: viewer follows them, they do not follow back.
    oneway = _register(client, "oneway@example.com", "oneway")
    _follow(client, viewer, "oneway")
    _finalize_rating(client, oneway, 101, "Split Song", "dislike")

    assert _modules(client, viewer)["disagreement_spotlight"] is None


def test_disagreement_drops_blocked_friend_below_threshold(client: TestClient):
    """Blocking a friend removes them from the aggregate; falling under 3 hides the spotlight."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 101, "Split Song", "like")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Split Song", "dislike")
    assert _modules(client, viewer)["disagreement_spotlight"] is not None

    _block(client, viewer, "friendc")

    assert _modules(client, viewer)["disagreement_spotlight"] is None


def test_disagreement_excludes_private_taste_friend(client: TestClient, db_session: Session):
    """A mutual friend who hides their taste leaves the aggregate (privacy regression)."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 101, "Split Song", "like")
    for name in ("frienda", "friendb", "friendc"):
        _friend_rates(client, viewer, "viewer", name, 101, "Split Song", "dislike")
    assert _modules(client, viewer)["disagreement_spotlight"] is not None

    profile = db_session.execute(
        select(Profile).where(Profile.username == "friendc")
    ).scalar_one()
    profile.is_public = False
    profile.visibility = "only_me"
    db_session.commit()

    assert _modules(client, viewer)["disagreement_spotlight"] is None


def test_disagreement_excludes_deleted_friend(client: TestClient):
    """A friend who deletes their account leaves the aggregate."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 101, "Split Song", "like")
    _friend_rates(client, viewer, "viewer", "frienda", 101, "Split Song", "dislike")
    _friend_rates(client, viewer, "viewer", "friendb", 101, "Split Song", "dislike")
    gone = _friend_rates(client, viewer, "viewer", "friendc", 101, "Split Song", "dislike")
    assert _modules(client, viewer)["disagreement_spotlight"] is not None

    response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {gone}"},
    )
    assert response.status_code == 204

    assert _modules(client, viewer)["disagreement_spotlight"] is None


# ── Split Decision ───────────────────────────────────────────────────────────


def _followed_rates(
    client: TestClient,
    viewer_token: str,
    viewer_name: str,
    name: str,
    deezer_id: int,
    title: str,
    bucket: str = "like",
    *,
    mutual: bool = False,
) -> str:
    """Register a user the viewer follows (one-way by default) who rates one song. Returns token.

    Split's audience is followed-visible people, so a one-way follow is the realistic case.
    """
    token = _register(client, f"{name}@example.com", name)
    _follow(client, viewer_token, name)
    if mutual:
        _follow(client, token, viewer_name)
    _finalize_rating(client, token, deezer_id, title, bucket)
    return token


def test_split_null_without_two_far_apart(client: TestClient):
    """Split needs >=2 followed-visible people far apart; one rater → null."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_rates(client, viewer, "viewer", "alpha", 101, "Lonely Song", "like")

    assert _modules(client, viewer)["split_decision"] is None


def test_split_surfaces_two_people_you_follow(client: TestClient):
    """Two people the viewer follows, far apart on one song → high/low + gap."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_rates(client, viewer, "viewer", "alpha", 101, "Split Song", "like")
    _followed_rates(client, viewer, "viewer", "bravo", 101, "Split Song", "dislike")

    d = _modules(client, viewer)["split_decision"]
    assert d is not None
    assert d["song"]["title"] == "Split Song"
    assert d["high"]["profile"]["username"] == "alpha"
    assert d["low"]["profile"]["username"] == "bravo"
    assert d["high"]["score"] > d["low"]["score"]
    assert d["gap"] >= 3.0


def test_split_includes_one_way_followed_person(client: TestClient):
    """Participants are followed-visible — a one-way follow (no follow-back) still counts."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_rates(client, viewer, "viewer", "alpha", 101, "Split Song", "like", mutual=False)
    _followed_rates(client, viewer, "viewer", "bravo", 101, "Split Song", "dislike", mutual=False)

    d = _modules(client, viewer)["split_decision"]
    assert d is not None
    assert {d["high"]["profile"]["username"], d["low"]["profile"]["username"]} == {"alpha", "bravo"}


def test_split_excludes_non_followed_person(client: TestClient):
    """A rater the viewer does NOT follow isn't a participant; dropping below 2 → null."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_rates(client, viewer, "viewer", "alpha", 101, "Split Song", "like")
    stranger = _register(client, "stranger@example.com", "stranger")  # not followed
    _finalize_rating(client, stranger, 101, "Split Song", "dislike")

    assert _modules(client, viewer)["split_decision"] is None


def test_split_excludes_viewer_as_participant(client: TestClient):
    """Even if the viewer rated the song, they are never one of the two shown."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 101, "Split Song", "like")  # viewer rates it too (sole in bucket)
    _followed_rates(client, viewer, "viewer", "alpha", 101, "Split Song", "like")
    _followed_rates(client, viewer, "viewer", "bravo", 101, "Split Song", "dislike")

    d = _modules(client, viewer)["split_decision"]
    assert d is not None
    names = {d["high"]["profile"]["username"], d["low"]["profile"]["username"]}
    assert "viewer" not in names
    assert names == {"alpha", "bravo"}


def test_split_excludes_blocked_participant(client: TestClient):
    """Blocking a participant removes them; dropping below 2 → null."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_rates(client, viewer, "viewer", "alpha", 101, "Split Song", "like")
    _followed_rates(client, viewer, "viewer", "bravo", 101, "Split Song", "dislike")
    assert _modules(client, viewer)["split_decision"] is not None

    _block(client, viewer, "bravo")

    assert _modules(client, viewer)["split_decision"] is None


def test_split_excludes_private_participant(client: TestClient, db_session: Session):
    """A participant who hides their taste leaves the pair; dropping below 2 → null."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_rates(client, viewer, "viewer", "alpha", 101, "Split Song", "like")
    _followed_rates(client, viewer, "viewer", "bravo", 101, "Split Song", "dislike")
    assert _modules(client, viewer)["split_decision"] is not None

    profile = db_session.execute(
        select(Profile).where(Profile.username == "bravo")
    ).scalar_one()
    profile.is_public = False
    profile.visibility = "only_me"
    db_session.commit()

    assert _modules(client, viewer)["split_decision"] is None


def test_split_picks_biggest_gap_even_when_another_is_more_recent(client: TestClient):
    """Gap-primary: the biggest-gap song wins even if a smaller-gap song was rated more recently."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_rates(client, viewer, "viewer", "alpha", 201, "Big Gap Song", "like")
    _followed_rates(client, viewer, "viewer", "bravo", 201, "Big Gap Song", "dislike")
    # Smaller gap, rated more recently:
    _followed_rates(client, viewer, "viewer", "charlie", 202, "Small Gap Song", "like")
    _followed_rates(client, viewer, "viewer", "delta", 202, "Small Gap Song", "alright")

    d = _modules(client, viewer)["split_decision"]
    assert d is not None
    assert d["song"]["title"] == "Big Gap Song"


def test_split_high_low_tie_break_is_deterministic(client: TestClient):
    """Equal high scores resolve by lower user_id (alpha registered before bravo)."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_rates(client, viewer, "viewer", "alpha", 101, "Split Song", "like")
    _followed_rates(client, viewer, "viewer", "bravo", 101, "Split Song", "like")  # ties alpha at the top
    _followed_rates(client, viewer, "viewer", "charlie", 101, "Split Song", "dislike")

    d = _modules(client, viewer)["split_decision"]
    assert d is not None
    assert d["high"]["profile"]["username"] == "alpha"   # lower user_id wins the tie
    assert d["low"]["profile"]["username"] == "charlie"


# ── Match Moment ─────────────────────────────────────────────────────────────


def _profile_user_id(db_session: Session, username: str) -> int:
    return db_session.execute(
        select(Profile).where(Profile.username == username)
    ).scalar_one().user_id


def _song_id(db_session: Session, deezer_id: int) -> int:
    return db_session.execute(
        select(Song).where(Song.deezer_id == deezer_id)
    ).scalar_one().id


def _insert_pick(
    db_session: Session,
    *,
    user_id: int,
    winner_song_id: int,
    loser_song_id: int,
    session_uuid: uuid.UUID,
    comparison_index: int | None = None,
    decision_duration_ms: int | None = None,
    finalized_at: datetime | None = None,
    winner_is_a: bool = True,
) -> None:
    """Insert a finalized head-to-head comparison directly (deterministic, no session flow).

    `winner_is_a` flips which slot (song_a/song_b) holds the winner so the loser-derivation branch
    in `match_moment_candidates` is exercised both ways. Unfinalized rows would be ignored, so we
    always stamp `finalized_at`.
    """
    db_session.add(
        Comparison(
            session_uuid=session_uuid,
            user_id=user_id,
            song_a_id=winner_song_id if winner_is_a else loser_song_id,
            song_b_id=loser_song_id if winner_is_a else winner_song_id,
            winner_id=winner_song_id,
            bucket="like",
            comparison_index_in_session=comparison_index,
            decision_duration_ms=decision_duration_ms,
            finalized_at=finalized_at if finalized_at is not None else datetime.now(timezone.utc),
        )
    )
    db_session.commit()


def _followed_makes_pick(
    client: TestClient,
    db_session: Session,
    viewer_token: str,
    name: str,
    *,
    winner_deezer: int,
    winner_title: str,
    loser_deezer: int,
    loser_title: str,
    session_uuid: uuid.UUID | None = None,
    comparison_index: int | None = None,
    decision_duration_ms: int | None = None,
    finalized_at: datetime | None = None,
    winner_is_a: bool = True,
) -> tuple[str, uuid.UUID]:
    """Register a user the viewer follows (one-way), give both songs a catalog row, and record a pick.

    Match Moment's audience is followed-visible people, so a one-way follow is the realistic case.
    The two songs land in different buckets so neither rating needs a comparison session. Returns the
    actor's token and the comparison session uuid.
    """
    token = _register(client, f"{name}@example.com", name)
    _follow(client, viewer_token, name)
    _finalize_rating(client, token, winner_deezer, winner_title, "like")
    _finalize_rating(client, token, loser_deezer, loser_title, "dislike")
    sid = session_uuid if session_uuid is not None else uuid.uuid4()
    _insert_pick(
        db_session,
        user_id=_profile_user_id(db_session, name),
        winner_song_id=_song_id(db_session, winner_deezer),
        loser_song_id=_song_id(db_session, loser_deezer),
        session_uuid=sid,
        comparison_index=comparison_index,
        decision_duration_ms=decision_duration_ms,
        finalized_at=finalized_at,
        winner_is_a=winner_is_a,
    )
    return token, sid


def test_match_moment_null_without_any_pick(client: TestClient):
    """No finalized comparison from anyone the viewer follows → locked (null)."""
    viewer = _register(client, "viewer@example.com", "viewer")

    assert _modules(client, viewer)["match_moment"] is None


def test_match_moment_surfaces_followed_pick(client: TestClient, db_session: Session):
    """A followed user's finalized pick surfaces as winner › loser with actor + decision time."""
    viewer = _register(client, "viewer@example.com", "viewer")
    # winner_is_a=False puts the winner in song_b, exercising the loser-derivation branch.
    _followed_makes_pick(
        client,
        db_session,
        viewer,
        "alpha",
        winner_deezer=301,
        winner_title="Chosen Song",
        loser_deezer=302,
        loser_title="Beaten Song",
        decision_duration_ms=1200,
        winner_is_a=False,
    )

    mm = _modules(client, viewer)["match_moment"]
    assert mm is not None
    assert mm["actor_profile"]["username"] == "alpha"
    assert mm["winner"]["title"] == "Chosen Song"
    assert mm["loser"]["title"] == "Beaten Song"
    assert mm["decision_duration_ms"] == 1200


def test_match_moment_dedupes_to_decisive_comparison_in_session(client: TestClient, db_session: Session):
    """Many comparisons share one session → the decisive last one (highest index) is the pick."""
    viewer = _register(client, "viewer@example.com", "viewer")
    # Early probe (index 1): picked Chosen over Beaten.
    _, sid = _followed_makes_pick(
        client,
        db_session,
        viewer,
        "alpha",
        winner_deezer=301,
        winner_title="Chosen Song",
        loser_deezer=302,
        loser_title="Beaten Song",
        session_uuid=uuid.uuid4(),
        comparison_index=1,
    )
    # Decisive last comparison (index 5) in the SAME session reverses it: Beaten beats Chosen.
    _insert_pick(
        db_session,
        user_id=_profile_user_id(db_session, "alpha"),
        winner_song_id=_song_id(db_session, 302),
        loser_song_id=_song_id(db_session, 301),
        session_uuid=sid,
        comparison_index=5,
    )

    mm = _modules(client, viewer)["match_moment"]
    assert mm is not None
    assert mm["winner"]["title"] == "Beaten Song"   # index 5 (decisive) wins, not index 1
    assert mm["loser"]["title"] == "Chosen Song"


def test_match_moment_returns_only_latest_across_followed(client: TestClient, db_session: Session):
    """When several followed users have picks, only the most recently finalized one shows."""
    viewer = _register(client, "viewer@example.com", "viewer")
    earlier = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    _followed_makes_pick(
        client,
        db_session,
        viewer,
        "alpha",
        winner_deezer=301,
        winner_title="Alpha Winner",
        loser_deezer=302,
        loser_title="Alpha Loser",
        finalized_at=earlier,
    )
    _followed_makes_pick(
        client,
        db_session,
        viewer,
        "bravo",
        winner_deezer=401,
        winner_title="Bravo Winner",
        loser_deezer=402,
        loser_title="Bravo Loser",
        finalized_at=earlier + timedelta(minutes=5),
    )

    mm = _modules(client, viewer)["match_moment"]
    assert mm is not None
    assert mm["actor_profile"]["username"] == "bravo"
    assert mm["winner"]["title"] == "Bravo Winner"


def test_match_moment_excludes_non_followed_person(client: TestClient, db_session: Session):
    """A finalized pick by someone the viewer does NOT follow never surfaces."""
    viewer = _register(client, "viewer@example.com", "viewer")
    stranger = _register(client, "stranger@example.com", "stranger")
    _finalize_rating(client, stranger, 301, "Chosen Song", "like")
    _finalize_rating(client, stranger, 302, "Beaten Song", "dislike")
    _insert_pick(
        db_session,
        user_id=_profile_user_id(db_session, "stranger"),
        winner_song_id=_song_id(db_session, 301),
        loser_song_id=_song_id(db_session, 302),
        session_uuid=uuid.uuid4(),
    )

    assert _modules(client, viewer)["match_moment"] is None


def test_match_moment_excludes_own_pick(client: TestClient, db_session: Session):
    """Match Moment is about people you follow — the viewer's own picks never appear."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _finalize_rating(client, viewer, 301, "Chosen Song", "like")
    _finalize_rating(client, viewer, 302, "Beaten Song", "dislike")
    _insert_pick(
        db_session,
        user_id=_profile_user_id(db_session, "viewer"),
        winner_song_id=_song_id(db_session, 301),
        loser_song_id=_song_id(db_session, 302),
        session_uuid=uuid.uuid4(),
    )

    assert _modules(client, viewer)["match_moment"] is None


def test_match_moment_excludes_blocked_actor(client: TestClient, db_session: Session):
    """Blocking the actor removes their pick from the module."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_makes_pick(
        client,
        db_session,
        viewer,
        "alpha",
        winner_deezer=301,
        winner_title="Chosen Song",
        loser_deezer=302,
        loser_title="Beaten Song",
    )
    assert _modules(client, viewer)["match_moment"] is not None

    _block(client, viewer, "alpha")

    assert _modules(client, viewer)["match_moment"] is None


def test_match_moment_excludes_private_actor(client: TestClient, db_session: Session):
    """An actor who hides their taste drops out of the module."""
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_makes_pick(
        client,
        db_session,
        viewer,
        "alpha",
        winner_deezer=301,
        winner_title="Chosen Song",
        loser_deezer=302,
        loser_title="Beaten Song",
    )
    assert _modules(client, viewer)["match_moment"] is not None

    profile = db_session.execute(
        select(Profile).where(Profile.username == "alpha")
    ).scalar_one()
    profile.is_public = False
    profile.visibility = "only_me"
    db_session.commit()

    assert _modules(client, viewer)["match_moment"] is None


def test_match_moment_blocked_by_base_gate(client: TestClient, db_session: Session, monkeypatch):
    """Real gate: a finalized pick stays null until the viewer clears rated >= 5 AND following >= 3."""
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_RATED", 10)
    monkeypatch.setattr("src.services.feed.MODULE_GATE_MIN_FOLLOWING", 1)
    viewer = _register(client, "viewer@example.com", "viewer")
    _followed_makes_pick(
        client,
        db_session,
        viewer,
        "alpha",
        winner_deezer=301,
        winner_title="Chosen Song",
        loser_deezer=302,
        loser_title="Beaten Song",
    )
    # following = 1 meets that threshold, but the viewer has rated 0 (< 10) → gate blocks the module.

    assert _modules(client, viewer)["match_moment"] is None
